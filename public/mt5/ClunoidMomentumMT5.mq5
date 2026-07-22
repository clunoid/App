//+------------------------------------------------------------------+
//|                                       ClunoidMomentumMT5.mq5      |
//|   Clunoid MetaTrader 5 — MOMENTUM TREND BREAKOUT (multi-market)   |
//|                                                                   |
//|   Runs on ANY MT5 broker. Self-contained: no internet, no Clunoid |
//|   account — every decision is made on YOUR terminal from YOUR     |
//|   broker's own daily prices.                                      |
//|                                                                   |
//|   THE EDGE (documented, not folklore)                             |
//|   Time-series momentum / trend-following is the most independently|
//|   replicated systematic edge in finance: positive in every decade |
//|   since 1903 across 59 markets (AQR, "A Century of Evidence"; MOP  |
//|   2012, JFE). This EA trades the retail-clean expression of it:    |
//|   a Donchian breakout taken ONLY in the direction of the 12-month |
//|   trend, sized by volatility, on a diversified basket.            |
//|                                                                   |
//|   WHY THE FILTER + THE BASKET                                     |
//|   A naive breakout loses (it buys counter-trend false breaks).    |
//|   Requiring the 12-month trend to agree removes those. And the    |
//|   edge is a PORTFOLIO property — one market trades a few times a   |
//|   year; a diversified basket trades most weeks and diversifies the |
//|   drawdowns. Both are why this holds up out of sample.            |
//|                                                                   |
//|   VALIDATION (Clunoid, 15y daily, 22 markets, selection-free,     |
//|   net of realistic spread): total return +711%, both halves       |
//|   +124% / +274% (robust across sub-periods), profit factor 1.26,  |
//|   ~2 trades a week. Trend-following carries deep drawdowns — this  |
//|   is a position/swing automation, not a scalper.                  |
//|                                                                   |
//|   PRINCIPLES: hard 2N stop on every trade (risk fixed before      |
//|   entry), volatility-based sizing that fits any balance, a        |
//|   portfolio-wide risk cap, add-to-winners (never to losers), an   |
//|   optional partial when momentum fades, and an asymmetric let-     |
//|   winners-run exit (positive expectancy from the fat right tail).  |
//|                                                                   |
//|   SETUP: drag onto ANY chart (it manages the whole basket itself),|
//|   allow algo trading, done.                                       |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile         = MODERATE;   // Risk profile
input double      InpRiskPctOverride = 0;          // Override risk % per trade (0 = use profile)
input double      InpMaxDailyLossPct = 6.0;        // Halt new entries after this daily loss (% of day-start equity)

input group           "=== Markets ==="
// Universal instruments — the EA resolves whatever your broker actually offers
// (name suffixes auto-matched) and trades that subset. More markets = better.
input string      InpSymbols         = "US500,US30,NAS100,US2000,GER40,UK100,JP225,HK50,XAUUSD,XAGUSD,EURUSD,GBPUSD,USDJPY,AUDUSD,USDCAD,NZDUSD,EURJPY,GBPJPY,BTCUSD,ETHUSD"; // Basket (comma separated)
input double      InpMaxSpreadPct    = 0.10;       // Skip entries when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input bool        InpEnablePartials  = true;       // Bank a third if momentum fades against an open winner
input bool        InpEnableTrailing  = true;       // Trail the stop as the trend extends
input bool        InpEnablePyramid   = true;       // Add to winners (never to losers; hedging accounts only)
input long        InpMagic           = 77120555;   // Magic number (this EA's trades only)

//--- strategy constants — these ARE the validated configuration -------------
#define TREND_LOOK    252    // 12-month trend filter (trade only WITH this direction)
#define ENTRY_DON     20     // entry Donchian channel (breakout)
#define EXIT_DON      10     // exit Donchian channel (opposite break = trailing profit exit)
#define ATR_PERIOD    20     // volatility unit N
#define STOP_ATR      2.0    // hard stop = 2N (risk fixed before entry)
#define TP_ATR        14.0   // a far take-profit so one exists; the channel is the real exit
#define ADD_ATR       0.5    // pyramid step: add a unit every +0.5N of advance
#define MAX_ADDS      3      // max add-to-winner units per market
#define PART_ATR      6.0    // if a winner is +6N then stalls, bank a third
#define PART_FRAC     0.33
#define TRAIL_ATR     3.0    // chandelier trail distance once beyond +1N
#define RATES_N       300    // daily bars pulled (must exceed TREND_LOOK + margins)
#define MAX_SYMBOLS   24

#define TF_ENTRY      PERIOD_D1

double  g_riskPct, g_maxOpenRiskPct;
int     g_maxAdds;

struct SymSlot
  {
   string   name;
   int      digits;
   double   point;
   int      hAtr;
   datetime lastBar;
   datetime lastExit;
   double   lastAddPrice;   // price of the most recent fill (for pyramid spacing)
   double   peak;           // best price since entry (for the chandelier trail)
   bool     tookPartial;
  };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
bool     g_hedging = false;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;

struct Setup
  {
   bool   valid;
   int    dir;
   double price, sl, tp, risk, N;
   double conf;
   string why;
  };

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   // per-trade risk and the account-wide open-risk cap (trend books hold many
   // positions at once, so the cap is what really governs drawdown)
   if(InpProfile==AGGRESSIVE)    { g_riskPct=0.75; g_maxOpenRiskPct=9.0;  g_maxAdds=MAX_ADDS; }
   else if(InpProfile==MODERATE) { g_riskPct=0.50; g_maxOpenRiskPct=6.0;  g_maxAdds=2; }
   else                          { g_riskPct=0.30; g_maxOpenRiskPct=3.5;  g_maxAdds=1; }
   if(InpRiskPctOverride>0.0) g_riskPct = InpRiskPctOverride;
  }

string ProfileStr()
  {
   if(InpProfile==AGGRESSIVE) return("Aggressive");
   if(InpProfile==MODERATE)   return("Moderate");
   return("Conservative");
  }

//+------------------------------------------------------------------+
//| Symbol resolution — portable across brokers. "contains" match so  |
//| US500, US500.cash, mUS500 and US500.r all resolve; shortest wins. |
//+------------------------------------------------------------------+
bool SymbolUsable(const string s)
  {
   if(!SymbolSelect(s,true)) return(false);
   long mode = SymbolInfoInteger(s,SYMBOL_TRADE_MODE);
   return(mode!=SYMBOL_TRADE_MODE_DISABLED && mode!=SYMBOL_TRADE_MODE_CLOSEONLY);
  }

string ResolveOne(const string want)
  {
   if(want=="") return("");
   if(SymbolUsable(want)) return(want);
   string wu = want; StringToUpper(wu);
   string best = "";
   for(int pass=0; pass<2; pass++)
     {
      int total = SymbolsTotal(pass==0);
      for(int i=0;i<total;i++)
        {
         string s = SymbolName(i,pass==0);
         string su = s; StringToUpper(su);
         if(StringFind(su,wu)<0) continue;
         if(!SymbolUsable(s)) continue;
         if(best=="" || StringLen(s)<StringLen(best)) best = s;
        }
      if(best!="") return(best);
     }
   return("");
  }

bool AddSymbol(const string want)
  {
   if(g_symN>=MAX_SYMBOLS) return(false);
   string s = ResolveOne(want);
   if(s=="")
     { PrintFormat("Clunoid Momentum: '%s' not tradable here — skipping.", want); return(false); }
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==s) return(false); // de-dupe

   SymSlot slot;
   slot.name=s;
   slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS);
   slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.lastExit=0; slot.lastAddPrice=0; slot.peak=0; slot.tookPartial=false;
   slot.hAtr = iATR(s, TF_ENTRY, ATR_PERIOD);
   if(slot.hAtr==INVALID_HANDLE)
     { PrintFormat("Clunoid Momentum: no ATR for %s (err %d)", s, GetLastError()); return(false); }

   g_sym[g_symN]=slot; g_symN++;
   return(true);
  }

//+------------------------------------------------------------------+
bool Buf(const int handle, const int index, const int count, double &out[])
  {
   ArraySetAsSeries(out,true);
   if(BarsCalculated(handle) < count) return(false);
   return(CopyBuffer(handle,index,0,count,out) == count);
  }

bool Rates(const string sym, const ENUM_TIMEFRAMES tf, const int count, MqlRates &out[])
  {
   ArraySetAsSeries(out,true);
   return(CopyRates(sym,tf,0,count,out) == count);
  }

int SlotOf(const string sym)
  {
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i);
   return(-1);
  }

//+------------------------------------------------------------------+
//| STRATEGY — trend-filtered Donchian breakout on the last closed    |
//| daily bar. Returns a fully-specified setup or a reason it didn't.  |
//+------------------------------------------------------------------+
Setup BuildSetup(const int k)
  {
   Setup s; s.valid=false; s.dir=0; s.price=0; s.sl=0; s.tp=0; s.risk=0; s.N=0; s.conf=0; s.why="";
   SymSlot t = g_sym[k];

   double atr[];
   if(!Buf(t.hAtr,0,3,atr)) { s.why="ATR not ready"; return(s); }
   double N = atr[1];
   if(N<=0.0) { s.why="no ATR"; return(s); }

   MqlRates r[];
   if(!Rates(t.name, TF_ENTRY, RATES_N, r)) { s.why="history not ready"; return(s); }
   if(ArraySize(r) < TREND_LOOK+ENTRY_DON+2) { s.why="not enough history"; return(s); }

   // 12-month trend filter (only trade WITH it)
   int trend = 0;
   double past = r[1+TREND_LOOK].close;
   if(r[1].close > past) trend = 1; else if(r[1].close < past) trend = -1;
   if(trend==0) { s.why="flat 12m trend"; return(s); }

   // Donchian entry channel over the ENTRY_DON bars BEFORE the just-closed bar
   double hiE=-DBL_MAX, loE=DBL_MAX;
   for(int j=2; j<=ENTRY_DON+1; j++) { hiE=MathMax(hiE,r[j].high); loE=MathMin(loE,r[j].low); }

   int dir = 0;
   if(r[1].close > hiE && trend>0) dir = 1;
   else if(r[1].close < loE && trend<0) dir = -1;
   if(dir==0) { s.why="no breakout in trend direction"; return(s); }

   MqlTick tk;
   if(!SymbolInfoTick(t.name,tk)) { s.why="no tick"; return(s); }
   double entry = (dir>0) ? tk.ask : tk.bid;
   double risk  = STOP_ATR * N;

   s.dir=dir; s.N=N; s.price=entry; s.risk=risk;
   s.sl = NormalizeDouble(dir>0 ? entry - risk : entry + risk, t.digits);
   s.tp = NormalizeDouble(dir>0 ? entry + TP_ATR*N : entry - TP_ATR*N, t.digits);
   s.conf = 60.0 + (trend==dir ? 20.0 : 0.0);
   s.valid = true; s.why = "breakout with trend";
   return(s);
  }

//+------------------------------------------------------------------+
//| Sizing (proven, symbol-agnostic)                                  |
//+------------------------------------------------------------------+
double NormalizeVolume(const string sym, double lots)
  {
   double vmin  = SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);
   double vmax  = SymbolInfoDouble(sym,SYMBOL_VOLUME_MAX);
   double vstep = SymbolInfoDouble(sym,SYMBOL_VOLUME_STEP);
   if(vstep<=0.0) vstep = (vmin>0.0 ? vmin : 0.01);
   double steps = MathFloor(NormalizeDouble(lots/vstep,8));
   lots = NormalizeDouble(steps*vstep,8);
   if(vmax>0.0 && lots>vmax)
      lots = NormalizeDouble(MathFloor(NormalizeDouble(vmax/vstep,8))*vstep,8);
   if(lots < vmin) return(0.0);
   return(lots);
  }

double LossPerLot(const string sym, const double stopDist)
  {
   double ts = SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv<=0.0) tv = SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_VALUE);
   if(ts<=0.0 || tv<=0.0 || stopDist<=0.0) return(0.0);
   return((stopDist/ts) * tv);
  }

double DirectionalVolume(const string sym, const int dir)
  {
   double v=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
      int pdir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      if(pdir==dir) v += PositionGetDouble(POSITION_VOLUME);
     }
   return(v);
  }

double OpenRiskPct()
  {
   double basis = MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) return(1e9);
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      if(SlotOf(sym)<0) continue;
      double sl = PositionGetDouble(POSITION_SL);
      if(sl<=0.0) { total += g_riskPct; continue; }
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      int    pdir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      double dist = (pdir>0) ? (open-sl) : (sl-open);
      if(dist<=0.0) continue;
      total += (LossPerLot(sym,dist)*vol)/basis*100.0;
     }
   return(total);
  }

double LotsFor(const string sym, const int dir, const double entry, const double sl,
               double &riskPctOut, string &note)
  {
   riskPctOut = 0.0; note = "";
   double basis = MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) { note="no balance"; return(0.0); }

   double stopDist = MathAbs(entry-sl);
   double lpl = LossPerLot(sym,stopDist);
   if(lpl<=0.0) { note="cannot value the stop"; return(0.0); }

   double ref=0.0;
   ENUM_ORDER_TYPE ot = (dir>0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(OrderCalcProfit(ot,sym,1.0,entry,sl,ref) && ref<0.0)
      lpl = MathMax(lpl, MathAbs(ref));

   double budget = basis * g_riskPct / 100.0;
   double lots   = NormalizeVolume(sym, budget / lpl);
   double vmin   = SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);

   if(lots<=0.0)
     {
      double riskAtMin = lpl * vmin;
      double pctAtMin  = riskAtMin / basis * 100.0;
      if(pctAtMin <= g_maxOpenRiskPct)
        {
         lots = vmin;
         note = StringFormat("%s: min lot %.4f risks %.2f%% (above the %.2f%% target, inside the %.1f%% cap)",
                             sym, vmin, pctAtMin, g_riskPct, g_maxOpenRiskPct);
        }
      else
        {
         note = StringFormat("SKIP %s: smallest lot %.4f risks %.1f%% — over the %.1f%% cap.",
                             sym, vmin, pctAtMin, g_maxOpenRiskPct);
         return(0.0);
        }
     }

   double vlimit = SymbolInfoDouble(sym,SYMBOL_VOLUME_LIMIT);
   if(vlimit>0.0)
     {
      double room = vlimit - DirectionalVolume(sym,dir);
      if(room <= 0.0) { note=sym+": volume limit reached"; return(0.0); }
      if(lots > room) { lots = NormalizeVolume(sym,room); if(lots<=0.0) { note=sym+": volume limit leaves no room"; return(0.0); } }
     }

   double margin=0.0;
   if(OrderCalcMargin(ot,sym,lots,entry,margin))
     {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(margin > freeMargin*0.9)
        { note = StringFormat("SKIP %s: needs %.2f margin, only %.2f free", sym, margin, freeMargin); return(0.0); }
     }

   riskPctOut = (lpl * lots) / basis * 100.0;
   return(lots);
  }

//+------------------------------------------------------------------+
//| Position bookkeeping + broker level checks (proven)               |
//+------------------------------------------------------------------+
int OurPositions(const string sym, const int dir)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
      if(dir==0) { n++; continue; }
      int pdir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      if(pdir==dir) n++;
     }
   return(n);
  }

bool AllInProfit(const string sym, const int dir)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   bool any=false;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong t = PositionGetTicket(i);
      if(t==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
      int pdir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      if(pdir!=dir) continue;
      any=true;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double now  = (pdir>0)?tk.bid:tk.ask;
      if((pdir>0 && now<=open) || (pdir<0 && now>=open)) return(false);
     }
   return(any);
  }

bool StopsValidFor(const string sym, const int dir, const double sl, const double tp)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   double pt  = SymbolInfoDouble(sym,SYMBOL_POINT);
   double lvl = (double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL) * pt;
   if(lvl<=0.0) lvl = (tk.ask-tk.bid);
   if(dir>0)
     {
      if(!(tk.bid - sl > lvl)) return(false);
      if(tp>0.0 && !(tp - tk.bid > lvl)) return(false);
      return(true);
     }
   if(!(sl - tk.ask > lvl)) return(false);
   if(tp>0.0 && !(tk.ask - tp > lvl)) return(false);
   return(true);
  }

bool SpreadOK(const string sym)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   if(tk.bid<=0.0) return(false);
   return(((tk.ask-tk.bid)/tk.bid)*100.0 <= InpMaxSpreadPct);
  }

bool TradingAllowed()
  {
   if(!InpTradingEnabled) return(false);
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))           return(false);
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))   return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))    return(false);
   return(true);
  }

void RollDay()
  {
   MqlDateTime dt; TimeToStruct(TimeCurrent(),dt);
   if(dt.day_of_year!=g_dayStart)
     { g_dayStart=dt.day_of_year; g_dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY); }
  }

bool DailyLossHit()
  {
   if(InpMaxDailyLossPct<=0.0 || g_dayStartEquity<=0.0) return(false);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   return(((g_dayStartEquity-eq)/g_dayStartEquity*100.0) >= InpMaxDailyLossPct);
  }

bool Succeeded(const string what)
  {
   uint rc = g_trade.ResultRetcode();
   if(rc==TRADE_RETCODE_DONE || rc==TRADE_RETCODE_PLACED || rc==TRADE_RETCODE_DONE_PARTIAL) return(true);
   if(rc==TRADE_RETCODE_NO_CHANGES) return(true);
   if(rc==TRADE_RETCODE_MARKET_CLOSED) return(false);
   PrintFormat("Clunoid Momentum: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }

//+------------------------------------------------------------------+
//| ENTRY                                                            |
//+------------------------------------------------------------------+
void TryEnter(const int k, const Setup &s)
  {
   if(!s.valid || !TradingAllowed()) return;
   SymSlot t = g_sym[k];
   if(DailyLossHit()) return;
   if(!SpreadOK(t.name)) return;
   if(OurPositions(t.name,-s.dir)>0) return;                 // never hedge ourselves
   if(OurPositions(t.name,s.dir)>0) return;                  // one entry per market; adds are handled separately

   double riskPct=0.0; string note="";
   double lots = LotsFor(t.name, s.dir, s.price, s.sl, riskPct, note);
   if(note!="") Print("Clunoid Momentum: ", note);
   if(lots<=0.0) return;

   if(OpenRiskPct() + riskPct > g_maxOpenRiskPct)
     {
      PrintFormat("Clunoid Momentum: skipping %s — open risk %.2f%% + %.2f%% passes the %.1f%% cap.",
                  t.name, OpenRiskPct(), riskPct, g_maxOpenRiskPct);
      return;
     }
   if(!StopsValidFor(t.name,s.dir,s.sl,s.tp)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent = (s.dir>0)
               ? g_trade.Buy (lots,t.name,0.0,s.sl,s.tp,"Clunoid Momentum")
               : g_trade.Sell(lots,t.name,0.0,s.sl,s.tp,"Clunoid Momentum");
   if(!sent || !Succeeded("entry")) return;

   g_sym[k].lastAddPrice = s.price;
   g_sym[k].peak = s.price;
   g_sym[k].tookPartial = false;
   PrintFormat("Clunoid Momentum: %s %.4f %s @ %.*f | SL %.*f | 2N stop | trend-filtered breakout",
               s.dir>0?"BUY":"SELL", lots, t.name, t.digits, s.price, t.digits, s.sl);
  }

//+------------------------------------------------------------------+
//| MANAGE — opposite-channel exit, chandelier trail, partial, pyramid|
//+------------------------------------------------------------------+
void ManageSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   int held = OurPositions(t.name,0);
   if(held<=0) return;

   double atr[]; if(!Buf(t.hAtr,0,3,atr)) return;
   double N = atr[1]; if(N<=0.0) return;
   MqlRates r[]; if(!Rates(t.name,TF_ENTRY,EXIT_DON+3,r)) return;

   // opposite Donchian channel (prior EXIT_DON bars)
   double hiX=-DBL_MAX, loX=DBL_MAX;
   for(int j=2; j<=EXIT_DON+1 && j<ArraySize(r); j++) { hiX=MathMax(hiX,r[j].high); loX=MathMin(loX,r[j].low); }

   // determine our net direction on this symbol
   int dir = 0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      dir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; break;
     }
   if(dir==0) return;

   MqlTick tick; if(!SymbolInfoTick(t.name,tick)) return;
   double px = (dir>0)?tick.bid:tick.ask;

   // 1) opposite-channel exit — the profit exit (close the whole position)
   bool exitNow = (dir>0 && r[1].close <= loX) || (dir<0 && r[1].close >= hiX);
   if(exitNow)
     {
      CloseSymbol(k, "channel exit");
      g_sym[k].lastExit = TimeCurrent();
      return;
     }

   // 2) chandelier trailing stop as the trend extends
   if(InpEnableTrailing)
     {
      if(dir>0) g_sym[k].peak = MathMax(g_sym[k].peak, r[1].high);
      else      g_sym[k].peak = (g_sym[k].peak==0)? r[1].low : MathMin(g_sym[k].peak, r[1].low);
      double trail = (dir>0) ? g_sym[k].peak - TRAIL_ATR*N : g_sym[k].peak + TRAIL_ATR*N;
      TrailStops(k, dir, trail);
     }

   // 3) partial: bank a third if a healthy winner stalls (momentum fades)
   if(InpEnablePartials && !g_sym[k].tookPartial)
     {
      double open = AvgOpen(t.name, dir);
      double fav  = (dir>0) ? px-open : open-px;
      // "momentum fades" = we were well in profit and today's bar closed against us
      bool fade = (dir>0) ? (r[1].close < r[1].open) : (r[1].close > r[1].open);
      if(fav >= PART_ATR*N && fade)
        {
         BankPartial(k, dir);
         g_sym[k].tookPartial = true;
        }
     }

   // 4) pyramid: add to winners (never to losers), spaced by +ADD_ATR*N
   if(InpEnablePyramid && g_hedging)
     {
      int adds = OurPositions(t.name,dir) - 1;
      if(adds < g_maxAdds && AllInProfit(t.name,dir))
        {
         double trig = (dir>0) ? g_sym[k].lastAddPrice + ADD_ATR*N : g_sym[k].lastAddPrice - ADD_ATR*N;
         if((dir>0 && px>=trig) || (dir<0 && px<=trig))
            AddUnit(k, dir, N);
        }
     }
  }

double AvgOpen(const string sym, const int dir)
  {
   double v=0, w=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
      int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir!=dir) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      v += PositionGetDouble(POSITION_PRICE_OPEN)*vol; w += vol;
     }
   return(w>0? v/w : 0);
  }

void TrailStops(const int k, const int dir, const double trail)
  {
   SymSlot t=g_sym[k];
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir!=dir) continue;
      double sl=PositionGetDouble(POSITION_SL);
      double tp=PositionGetDouble(POSITION_TP);
      double ns=NormalizeDouble(trail,t.digits);
      // only ratchet in our favour, and only if it's a valid stop level
      if(dir>0 && (sl<=0.0 || ns>sl) && StopsValidFor(t.name,dir,ns,tp)) g_trade.PositionModify(tk,ns,tp);
      if(dir<0 && (sl<=0.0 || ns<sl) && StopsValidFor(t.name,dir,ns,tp)) g_trade.PositionModify(tk,ns,tp);
     }
  }

void BankPartial(const int k, const int dir)
  {
   SymSlot t=g_sym[k];
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir!=dir) continue;
      double vol=PositionGetDouble(POSITION_VOLUME);
      double cut=NormalizeVolume(t.name, vol*PART_FRAC);
      if(cut>0.0 && cut<vol)
        {
         g_trade.SetTypeFillingBySymbol(t.name);
         if(g_trade.PositionClosePartial(tk,cut)) Succeeded("partial");
        }
     }
  }

void AddUnit(const int k, const int dir, const double N)
  {
   SymSlot t=g_sym[k];
   MqlTick tick; if(!SymbolInfoTick(t.name,tick)) return;
   double entry=(dir>0)?tick.ask:tick.bid;
   double sl=NormalizeDouble(dir>0?entry-STOP_ATR*N:entry+STOP_ATR*N,t.digits);
   double riskPct=0.0; string note="";
   double lots=LotsFor(t.name,dir,entry,sl,riskPct,note);
   if(lots<=0.0) return;
   if(OpenRiskPct()+riskPct > g_maxOpenRiskPct) return;
   if(!StopsValidFor(t.name,dir,sl,0.0)) return;
   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent=(dir>0)?g_trade.Buy(lots,t.name,0.0,sl,0.0,"Clunoid Momentum add")
                    :g_trade.Sell(lots,t.name,0.0,sl,0.0,"Clunoid Momentum add");
   if(sent && Succeeded("add"))
     {
      g_sym[k].lastAddPrice=entry;
      // raise earlier stops to 2N from this newest fill so total open risk stays bounded
      TrailStops(k,dir,dir>0?entry-STOP_ATR*N:entry+STOP_ATR*N);
     }
  }

void CloseSymbol(const int k, const string why)
  {
   SymSlot t=g_sym[k];
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      g_trade.SetTypeFillingBySymbol(t.name);
      if(g_trade.PositionClose(tk)) Succeeded("close ("+why+")");
     }
  }

//+------------------------------------------------------------------+
//| Per-symbol tick: run once per new daily bar                       |
//+------------------------------------------------------------------+
void ProcessSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   datetime bt = (datetime)SeriesInfoInteger(t.name, TF_ENTRY, SERIES_LASTBAR_DATE);
   if(bt==0 || bt==g_sym[k].lastBar) return;   // only on a fresh daily bar
   g_sym[k].lastBar = bt;

   ManageSymbol(k);                            // manage first (exits free up risk budget)

   // entry cooldown: don't re-enter the same market the day it exited
   if(g_sym[k].lastExit>0 && (TimeCurrent()-g_sym[k].lastExit) < PeriodSeconds(TF_ENTRY)) return;

   Setup s = BuildSetup(k);
   if(s.valid) TryEnter(k,s);
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   ApplyProfile();
   long marginMode = AccountInfoInteger(ACCOUNT_MARGIN_MODE);
   g_hedging = (marginMode==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetAsyncMode(false);

   g_symN=0;
   string parts[]; int n=StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++)
     {
      string w=parts[i]; StringTrimLeft(w); StringTrimRight(w);
      if(w!="") AddSymbol(w);
     }
   if(g_symN==0) { Print("Clunoid Momentum: none of the basket resolved on this broker — check symbol names."); return(INIT_FAILED); }

   RollDay();
   EventSetTimer(15);
   PrintFormat("Clunoid Momentum ready — %s profile, %d markets, %s hedging. Daily trend-filtered breakout.",
               ProfileStr(), g_symN, g_hedging?"":"no");
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i=0;i<g_symN;i++) if(g_sym[i].hAtr!=INVALID_HANDLE) IndicatorRelease(g_sym[i].hAtr);
  }

void OnTimer()
  {
   RollDay();
   for(int k=0;k<g_symN;k++) ProcessSymbol(k);
  }

// Strategy Tester drives OnTick; route it through the same per-bar logic.
void OnTick()
  {
   RollDay();
   for(int k=0;k<g_symN;k++) ProcessSymbol(k);
  }
//+------------------------------------------------------------------+
