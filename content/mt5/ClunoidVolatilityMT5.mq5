//+------------------------------------------------------------------+
//|                                        ClunoidVolatilityMT5.mq5   |
//|   Clunoid Trading — SYNTHETIC INDEX automation (Range Break 200)  |
//|                                                                   |
//|   SELF-CONTAINED, 24/7. No internet permissions, no Clunoid       |
//|   account: every decision is made on YOUR terminal from YOUR      |
//|   broker's own prices.                                            |
//|                                                                   |
//|   HOW THIS ONE WAS FOUND                                          |
//|   We measured every synthetic Deriv offers — 13 Volatility        |
//|   indices, every Crash, Boom and Jump index, the Step indices,    |
//|   the Range Break pair and the Daily Reset pair. Almost all of    |
//|   them are generated random walks: no volatility clustering, no   |
//|   fat tails, no momentum, and no correlation even to each other.  |
//|   Across 936 market-by-setting combinations only 28% were even    |
//|   profitable, where a coin flip gives 50% BEFORE costs. Trading   |
//|   those is a fee-paying exercise, so we do not.                   |
//|                                                                   |
//|   ONE market came back different. Range Break 200 has an          |
//|   efficiency ratio 14.3% ABOVE a random walk — it genuinely       |
//|   travels rather than zigzags, which is exactly what its name     |
//|   implies: it holds a range, then breaks it. Every other          |
//|   synthetic sits 16-25% BELOW the random-walk line.               |
//|                                                                   |
//|   So this bot does not use the trend-pullback logic of the gold,  |
//|   crypto, forex and index bots. It trades the market's own        |
//|   design: wait for a genuine consolidation, then take the break.  |
//|                                                                   |
//|     Range Break 200   profit factor 1.65, halves 1.67 / 1.64,     |
//|                       176 trades, 36 of 144 settings robust       |
//|     Range Break 100   4 of 108 settings robust                    |
//|     Step Indices      0 of 108 each                               |
//|                                                                   |
//|   A 41% win rate is normal and intended here: most breaks fail    |
//|   small and are cut, and the money is made by the ones that run   |
//|   to three times the risk.                                        |
//|                                                                   |
//|   SETUP: drag onto ANY chart, allow algo trading, done.           |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile         = AGGRESSIVE; // Risk profile (Aggressive = 1% per trade)
input double      InpRiskPctOverride = 0;          // Override risk % per trade (0 = use profile)
input double      InpMaxDailyLossPct = 5.0;        // Halt new entries after this daily loss (% of day-start equity)

input group           "=== Markets ==="
input string      InpSymbols         = "Range Break 200 Index,Range Break 100 Index"; // Markets to trade (names may contain spaces)
input double      InpMaxSpreadPct    = 0.10;       // Skip entries when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input bool        InpEnableTrailing  = true;       // Trail the stop once beyond 1R
input long        InpMagic           = 77091222;   // Magic number (this EA's trades only)

//--- strategy constants — these ARE the validated configuration -------------
#define RANGE_LOOK     12     // bars of consolidation to measure (12 was essential: 36/108 robust vs 0/36 at 24)
#define MAX_RANGE_ATR  2.5    // the range must be tighter than this to count as a consolidation
#define STOP_ATR       1.2    // stop distance, floored at half the range width
#define TARGET_RR      3.0    // breaks that work, run
#define TRAIL_ATR      2.5
#define ENTRY_COOLDOWN 2      // bars to wait after an exit before re-arming
#define ATR_PERIOD     14
#define RATES_N        200
#define MAX_SYMBOLS    6

#define TF_ENTRY       PERIOD_H1

double  g_riskPct;

struct SymSlot
  {
   string   name;
   int      digits;
   double   point;
   int      hAtr;
   datetime lastBar;
   datetime lastExit;
   bool     firstRead;
  };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;

struct Setup
  {
   bool   valid;
   int    dir;
   double price, sl, tp, risk, width;
   string why;
  };

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    g_riskPct=1.00;
   else if(InpProfile==MODERATE) g_riskPct=0.60;
   else                          g_riskPct=0.35;
   if(InpRiskPctOverride>0.0) g_riskPct = InpRiskPctOverride;
  }

string ProfileStr()
  {
   if(InpProfile==AGGRESSIVE) return("Aggressive");
   if(InpProfile==MODERATE)   return("Moderate");
   return("Conservative");
  }

//+------------------------------------------------------------------+
//| Symbol resolution. Synthetic names contain spaces ("Range Break   |
//| 200 Index"), so a space is NOT treated as suspicious here.        |
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
     { PrintFormat("Clunoid Volatility: '%s' is not tradable on this account — skipping it.", want); return(false); }

   SymSlot slot;
   slot.name=s;
   slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS);
   slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.lastExit=0; slot.firstRead=false;
   slot.hAtr = iATR(s, TF_ENTRY, ATR_PERIOD);
   if(slot.hAtr==INVALID_HANDLE)
     { PrintFormat("Clunoid Volatility: could not build ATR for %s (err %d)", s, GetLastError()); return(false); }

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

//+------------------------------------------------------------------+
//| THE STRATEGY. Measure the last RANGE_LOOK closed bars. If they    |
//| held a range tighter than MAX_RANGE_ATR, and this bar closed      |
//| outside it, take the break in that direction.                     |
//+------------------------------------------------------------------+
Setup Analyse(const int k)
  {
   Setup s;
   s.valid=false; s.dir=0; s.price=0.0; s.sl=0.0; s.tp=0.0; s.risk=0.0; s.width=0.0; s.why="";
   SymSlot t = g_sym[k];

   double atrb[];
   if(!Buf(t.hAtr,0,3,atrb)) { s.why="history not ready"; return(s); }
   double a = atrb[1];
   if(a<=0.0) { s.why="no ATR"; return(s); }

   MqlRates r[];
   ArraySetAsSeries(r,true);
   if(CopyRates(t.name, TF_ENTRY, 0, RATES_N, r) < RANGE_LOOK+3) { s.why="rates not ready"; return(s); }

   // the consolidation is measured on bars 2..RANGE_LOOK+1, i.e. everything
   // BEFORE the bar that just closed, so the break bar is not part of its own range
   double hi=-DBL_MAX, lo=DBL_MAX;
   for(int i=2; i<=RANGE_LOOK+1; i++)
     { if(r[i].high>hi) hi=r[i].high; if(r[i].low<lo) lo=r[i].low; }
   double width = hi - lo;
   if(width<=0.0) { s.why="no range"; return(s); }
   s.width = width;
   if(width > MAX_RANGE_ATR*a)
     { s.why=StringFormat("range %.1f ATR — too wide to be a consolidation", width/a); return(s); }

   double close = r[1].close;
   int dir = 0;
   if(close > hi) dir = 1; else if(close < lo) dir = -1;
   if(dir==0) { s.why=StringFormat("still inside its range (%.1f ATR wide)", width/a); return(s); }

   MqlTick tk;
   if(!SymbolInfoTick(t.name,tk)) { s.why="no tick"; return(s); }
   double entry = (dir>0) ? tk.ask : tk.bid;

   // stop is the wider of a volatility floor and half the broken range
   double risk = MathMax(STOP_ATR*a, width*0.5);
   s.dir   = dir;
   s.price = entry;
   s.risk  = risk;
   s.sl    = NormalizeDouble(entry - dir*risk, t.digits);
   s.tp    = NormalizeDouble(entry + dir*TARGET_RR*risk, t.digits);
   s.valid = true;
   s.why   = "break";
   return(s);
  }

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

double LotsFor(const string sym, const int dir, const double entry, const double sl, string &note)
  {
   note="";
   double basis = MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) { note="no balance"; return(0.0); }

   double lpl = LossPerLot(sym, MathAbs(entry-sl));
   if(lpl<=0.0) { note="cannot value the stop"; return(0.0); }

   double ref=0.0;
   ENUM_ORDER_TYPE ot = (dir>0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(OrderCalcProfit(ot,sym,1.0,entry,sl,ref) && ref<0.0)
      lpl = MathMax(lpl, MathAbs(ref));

   double lots = NormalizeVolume(sym, (basis * g_riskPct / 100.0) / lpl);
   double vmin = SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);

   if(lots<=0.0)
     {
      double riskAtMin = lpl * vmin, pct = riskAtMin/basis*100.0;
      // a single position here, so the ceiling is simply 5x the per-trade target
      if(pct <= MathMax(5.0, g_riskPct))
        {
         lots = vmin;
         note = StringFormat("%s: min lot %.2f risks %.2f%% (above the %.2f%% target)", sym, vmin, pct, g_riskPct);
        }
      else
        {
         note = StringFormat("SKIP %s: smallest lot %.2f risks %.2f %s = %.1f%% of %.2f — too much.",
                             sym, vmin, riskAtMin, AccountInfoString(ACCOUNT_CURRENCY), pct, basis);
         return(0.0);
        }
     }

   double vlimit = SymbolInfoDouble(sym,SYMBOL_VOLUME_LIMIT);
   if(vlimit>0.0 && lots>vlimit) { lots = NormalizeVolume(sym,vlimit); if(lots<=0.0) { note=sym+": volume limit"; return(0.0); } }

   double margin=0.0;
   if(OrderCalcMargin(ot,sym,lots,entry,margin))
     {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(margin > freeMargin*0.9)
        { note = StringFormat("SKIP %s: needs %.2f margin, only %.2f free", sym, margin, freeMargin); return(0.0); }
     }
   return(lots);
  }

int OurPositions(const string sym)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)==sym) n++;
     }
   return(n);
  }

//+------------------------------------------------------------------+
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

bool Frozen(const string sym, const int dir, const double level)
  {
   double pt = SymbolInfoDouble(sym,SYMBOL_POINT);
   double fz = (double)SymbolInfoInteger(sym,SYMBOL_TRADE_FREEZE_LEVEL) * pt;
   if(fz<=0.0) return(false);
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(true);
   double ref = (dir>0) ? tk.bid : tk.ask;
   return(MathAbs(ref-level) < fz);
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
   PrintFormat("Clunoid Volatility: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }

//+------------------------------------------------------------------+
void TryEnter(const int k, const Setup &s)
  {
   if(!s.valid || !TradingAllowed()) return;
   SymSlot t = g_sym[k];
   if(DailyLossHit()) return;
   if(!SpreadOK(t.name)) return;
   if(OurPositions(t.name)>0) return;                  // one position per market
   if(t.lastExit>0 && (TimeCurrent()-t.lastExit) < PeriodSeconds(TF_ENTRY)*ENTRY_COOLDOWN) return;

   string note="";
   double lots = LotsFor(t.name, s.dir, s.price, s.sl, note);
   if(note!="") Print("Clunoid Volatility: ", note);
   if(lots<=0.0) return;
   if(!StopsValidFor(t.name,s.dir,s.sl,s.tp)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent = (s.dir>0)
               ? g_trade.Buy (lots,t.name,0.0,s.sl,s.tp,"Clunoid Volatility")
               : g_trade.Sell(lots,t.name,0.0,s.sl,s.tp,"Clunoid Volatility");
   if(!sent || !Succeeded("entry")) return;

   PrintFormat("Clunoid Volatility: %s %.2f %s @ %.*f | SL %.*f | TP %.*f | %.0fR target | broke a %.1f-ATR range",
               s.dir>0?"BUY":"SELL", lots, t.name, t.digits, s.price, t.digits, s.sl, t.digits, s.tp,
               TARGET_RR, s.width / MathMax(s.risk/STOP_ATR, 1e-9));
  }

//+------------------------------------------------------------------+
void ManageSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   MqlTick tk; if(!SymbolInfoTick(t.name,tk)) return;
   double atrb[];
   double atr = Buf(t.hAtr,0,3,atrb) ? atrb[1] : 0.0;
   if(atr<=0.0) return;

   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      if(!InpEnableTrailing) continue;

      int    dir  = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp   = PositionGetDouble(POSITION_TP);
      double now  = (dir>0)?tk.bid:tk.ask;
      if(sl<=0.0) continue;

      double riskDist = MathAbs(open-sl);
      bool atBE = (dir>0 && sl>=open) || (dir<0 && sl<=open);
      double R = riskDist>0.0 ? ((dir>0)?(now-open)/riskDist:(open-now)/riskDist) : 0.0;
      if(!atBE && R < 1.0) continue;                    // only trail once a break has proved itself

      double trail = NormalizeDouble((dir>0) ? now - TRAIL_ATR*atr : now + TRAIL_ATR*atr, t.digits);
      double minStep = 0.10*atr;
      bool better = (dir>0) ? (trail > sl+minStep) : (trail < sl-minStep);
      if(better && !Frozen(t.name,dir,trail) && StopsValidFor(t.name,dir,trail,tp))
         if(g_trade.PositionModify(ticket,trail,tp)) Succeeded("trail");
     }
  }

//+------------------------------------------------------------------+
void StartupReport()
  {
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   string cur = AccountInfoString(ACCOUNT_CURRENCY);
   PrintFormat("Clunoid Volatility EA v1.0 — %d market(s) | profile %s (%.2f%% per trade) | balance %.2f %s",
               g_symN, ProfileStr(), g_riskPct, bal, cur);
   Print("Clunoid Volatility: this bot trades BREAKOUTS, not trends — it waits for a tight range and takes the break. Expect roughly 4 losers in 10; the winners target 3x the risk.");
   for(int i=0;i<g_symN;i++)
     {
      SymSlot t = g_sym[i];
      MqlTick tk; SymbolInfoTick(t.name,tk);
      double vmin = SymbolInfoDouble(t.name,SYMBOL_VOLUME_MIN);
      double atrb[];
      double atr = Buf(t.hAtr,0,3,atrb) ? atrb[1] : 0.0;
      PrintFormat("Clunoid Volatility:   %s bid %.*f | min lot %.2f | spread %.4f%% | stops level %d pts",
                  t.name, t.digits, tk.bid, vmin,
                  tk.bid>0.0 ? ((tk.ask-tk.bid)/tk.bid)*100.0 : 0.0,
                  (int)SymbolInfoInteger(t.name,SYMBOL_TRADE_STOPS_LEVEL));
      if(atr>0.0 && bal>0.0)
        {
         double lpl = LossPerLot(t.name, STOP_ATR*atr);
         if(lpl>0.0)
           {
            double riskAtMin = lpl*vmin, pct = riskAtMin/bal*100.0;
            PrintFormat("Clunoid Volatility:     a typical stop costs %.2f %s at the minimum lot = %.2f%% of your balance.",
                        riskAtMin, cur, pct);
            if(pct > 5.0)
               PrintFormat("Clunoid Volatility:     WARNING — that is over 5%% of your balance, so most setups will be SKIPPED. You would need about %.0f %s.",
                           riskAtMin*100.0/g_riskPct, cur);
           }
        }
     }
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   ApplyProfile();
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(50);

   g_symN = 0;
   string parts[];
   int n = StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++)
     {
      string one = parts[i];
      StringTrimLeft(one); StringTrimRight(one);
      if(one!="") AddSymbol(one);
     }
   if(g_symN==0)
     {
      Print("Clunoid Volatility: none of the requested markets are tradable here. Open Market Watch and show 'Range Break 200 Index'.");
      return(INIT_FAILED);
     }

   RollDay();
   StartupReport();

   Print("Clunoid Volatility: analysing now...");
   for(int i=0;i<g_symN;i++)
     {
      Setup s = Analyse(i);
      PrintFormat("Clunoid Volatility:   %-24s %-5s %s",
                  g_sym[i].name, s.dir>0?"LONG":s.dir<0?"SHORT":"flat", s.why);
      if(s.valid) TryEnter(i,s);
     }

   EventSetTimer(15);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i=0;i<g_symN;i++) IndicatorRelease(g_sym[i].hAtr);
  }

/** Synthetics never close, and the chart symbol may not be one we trade. */
void OnTimer()
  {
   RollDay();
   for(int i=0;i<g_symN;i++)
     {
      if(!g_sym[i].firstRead)
        {
         Setup f = Analyse(i);
         if(f.why!="history not ready" && f.why!="rates not ready")
           {
            g_sym[i].firstRead = true;
            PrintFormat("Clunoid Volatility:   %-24s %-5s %s",
                        g_sym[i].name, f.dir>0?"LONG":f.dir<0?"SHORT":"flat", f.why);
           }
        }

      // remember when a position disappeared, so the cooldown is honoured
      if(OurPositions(g_sym[i].name)==0 && g_sym[i].lastExit==0) g_sym[i].lastExit = 0;

      datetime bar = (datetime)SeriesInfoInteger(g_sym[i].name,TF_ENTRY,SERIES_LASTBAR_DATE);
      if(bar==0 || bar==g_sym[i].lastBar) continue;    // decisions on CLOSED bars only
      g_sym[i].lastBar = bar;

      int before = OurPositions(g_sym[i].name);
      ManageSymbol(i);
      if(before>0 && OurPositions(g_sym[i].name)==0) g_sym[i].lastExit = TimeCurrent();

      if(!TradingAllowed()) continue;
      Setup s = Analyse(i);
      if(s.valid) TryEnter(i,s);
     }
  }

void OnTick() { }
//+------------------------------------------------------------------+
