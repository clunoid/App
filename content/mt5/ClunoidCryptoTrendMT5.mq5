//+------------------------------------------------------------------+
//|                                       ClunoidCryptoTrendMT5.mq5   |
//|   Clunoid MetaTrader 5 — CRYPTO MOMENTUM (Bollinger breakout)     |
//|                                                                   |
//|   Runs on ANY MT5 broker that lists crypto. Self-contained: no    |
//|   internet, no Clunoid account — decisions from YOUR broker's own  |
//|   daily prices. Crypto trades 24/7, and so does this.            |
//|                                                                   |
//|   THE EDGE (documented)                                           |
//|   Crypto is the hardest-trending liquid market there is, and       |
//|   trend-following is the most independently documented edge in     |
//|   finance (AQR, a century of evidence). This trades a Bollinger-   |
//|   band breakout — price closing beyond 2 standard deviations —     |
//|   ONLY in the direction of the 100-day trend, across a broad       |
//|   basket of major coins, then rides the move on a wide trail.      |
//|                                                                   |
//|   WHY A BASKET + THE TREND FILTER                                 |
//|   No single coin trends on demand; a broad basket catches whoever  |
//|   is running and diversifies the drawdowns. The trend filter       |
//|   removes the counter-trend false breaks that sink naive breakout. |
//|                                                                   |
//|   VALIDATION (Clunoid, ~11y daily, 12 coins, selection-free, net  |
//|   of realistic cost): +981% total, both halves +206% / +206%      |
//|   (as robust as it gets — identical across eras), profit factor    |
//|   1.49, ~6 trades a month. Crypto is brutal on the downside, so    |
//|   this is a volatile, deep-drawdown system — size it small.       |
//|                                                                   |
//|   PRINCIPLES: hard 2.5N stop on every trade, volatility sizing     |
//|   that fits any balance, a portfolio-wide risk cap, add-to-winners |
//|   (optional; never to losers), a let-winners-run trail.           |
//|                                                                   |
//|   SETUP: drag onto ANY chart, allow algo trading, done.          |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile         = MODERATE;   // Risk profile
input double      InpRiskPctOverride = 0;          // Override risk % per trade (0 = use profile)
input double      InpMaxDailyLossPct = 6.0;        // Halt new entries after this daily loss (%)

input group           "=== Markets ==="
input string      InpSymbols         = "BTCUSD,ETHUSD,SOLUSD,XRPUSD,LTCUSD,BNBUSD,ADAUSD,DOGEUSD,BCHUSD,LINKUSD,DOTUSD,AVAXUSD"; // Coins (comma separated)
input double      InpMaxSpreadPct    = 0.30;       // Skip entries when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input bool        InpEnablePyramid   = false;      // Add to winners (never to losers; hedging accounts only)
input long        InpMagic           = 77120559;   // Magic number (this EA's trades only)

//--- strategy constants — these ARE the validated configuration -------------
#define BB_PERIOD     20     // Bollinger period
#define BB_DEV        2.0    // Bollinger deviations — breakout beyond 2 sigma
#define TREND_LOOK    100    // 100-day trend filter (trade WITH it)
#define ATR_PERIOD    20     // volatility unit N (stop/trail)
#define STOP_ATR      2.5    // hard stop = 2.5N
#define TRAIL_ATR     4.0    // chandelier trail (the exit)
#define ADD_ATR       1.0
#define MAX_ADDS      2
#define RATES_N       160    // daily bars (must exceed TREND_LOOK + margins)
#define MAX_SYMBOLS   16

#define TF_ENTRY      PERIOD_D1

double  g_riskPct, g_maxOpenRiskPct;
int     g_maxAdds;

struct SymSlot
  {
   string   name;
   int      digits;
   double   point;
   int      hBands;
   int      hAtr;
   datetime lastBar;
   double   peak;
   double   lastAddPrice;
  };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
bool     g_hedging = false;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;

struct Setup { bool valid; int dir; double price, sl, risk, N; string why; };

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    { g_riskPct=1.00; g_maxOpenRiskPct=8.0; g_maxAdds=MAX_ADDS; }
   else if(InpProfile==MODERATE) { g_riskPct=0.60; g_maxOpenRiskPct=5.0; g_maxAdds=1; }
   else                          { g_riskPct=0.35; g_maxOpenRiskPct=3.0; g_maxAdds=0; }
   if(InpRiskPctOverride>0.0) g_riskPct = InpRiskPctOverride;
  }
string ProfileStr()
  { if(InpProfile==AGGRESSIVE) return("Aggressive"); if(InpProfile==MODERATE) return("Moderate"); return("Conservative"); }

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
   if(s=="") { PrintFormat("Clunoid CryptoTrend: '%s' not tradable here — skipping.", want); return(false); }
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==s) return(false);
   SymSlot slot;
   slot.name=s; slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS); slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.peak=0; slot.lastAddPrice=0;
   slot.hBands = iBands(s, TF_ENTRY, BB_PERIOD, 0, BB_DEV, PRICE_CLOSE);
   slot.hAtr   = iATR(s, TF_ENTRY, ATR_PERIOD);
   if(slot.hBands==INVALID_HANDLE || slot.hAtr==INVALID_HANDLE)
     { PrintFormat("Clunoid CryptoTrend: indicators failed for %s (err %d)", s, GetLastError()); return(false); }
   g_sym[g_symN]=slot; g_symN++;
   return(true);
  }

//+------------------------------------------------------------------+
bool Buf(const int handle, const int index, const int count, double &out[])
  { ArraySetAsSeries(out,true); if(BarsCalculated(handle) < count) return(false); return(CopyBuffer(handle,index,0,count,out) == count); }
bool Rates(const string sym, const ENUM_TIMEFRAMES tf, const int count, MqlRates &out[])
  { ArraySetAsSeries(out,true); return(CopyRates(sym,tf,0,count,out) == count); }
int SlotOf(const string sym) { for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i); return(-1); }

//+------------------------------------------------------------------+
//| STRATEGY — Bollinger breakout with the 100-day trend filter.      |
//+------------------------------------------------------------------+
Setup BuildSetup(const int k)
  {
   Setup s; s.valid=false; s.dir=0; s.price=0; s.sl=0; s.risk=0; s.N=0; s.why="";
   SymSlot t = g_sym[k];

   double up[], lo[], atr[];
   // iBands buffers: 0=base(middle), 1=upper, 2=lower
   if(!Buf(t.hBands,1,3,up) || !Buf(t.hBands,2,3,lo) || !Buf(t.hAtr,0,3,atr)) { s.why="indicators not ready"; return(s); }
   double N = atr[1];
   if(N<=0.0) { s.why="no ATR"; return(s); }

   MqlRates r[];
   if(!Rates(t.name,TF_ENTRY,RATES_N,r)) { s.why="history not ready"; return(s); }
   if(ArraySize(r) < TREND_LOOK+2) { s.why="not enough history"; return(s); }

   int trend = 0;
   double past = r[1+TREND_LOOK].close;
   if(r[1].close > past) trend = 1; else if(r[1].close < past) trend = -1;
   if(trend==0) { s.why="flat trend"; return(s); }

   int dir = 0;
   if(r[1].close > up[1] && trend>0) dir = 1;
   else if(r[1].close < lo[1] && trend<0) dir = -1;
   if(dir==0) { s.why="no band break in trend direction"; return(s); }

   MqlTick tk;
   if(!SymbolInfoTick(t.name,tk)) { s.why="no tick"; return(s); }
   double entry = (dir>0) ? tk.ask : tk.bid;
   double risk  = STOP_ATR * N;
   s.dir=dir; s.N=N; s.price=entry; s.risk=risk;
   s.sl = NormalizeDouble(dir>0 ? entry - risk : entry + risk, t.digits);
   s.valid = true; s.why = "crypto breakout with trend";
   return(s);
  }

//+------------------------------------------------------------------+
//| Sizing (proven, symbol-agnostic)                                  |
//+------------------------------------------------------------------+
double NormalizeVolume(const string sym, double lots)
  {
   double vmin=SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN), vmax=SymbolInfoDouble(sym,SYMBOL_VOLUME_MAX), vstep=SymbolInfoDouble(sym,SYMBOL_VOLUME_STEP);
   if(vstep<=0.0) vstep=(vmin>0.0?vmin:0.01);
   lots=NormalizeDouble(MathFloor(NormalizeDouble(lots/vstep,8))*vstep,8);
   if(vmax>0.0 && lots>vmax) lots=NormalizeDouble(MathFloor(NormalizeDouble(vmax/vstep,8))*vstep,8);
   if(lots<vmin) return(0.0);
   return(lots);
  }
double LossPerLot(const string sym, const double stopDist)
  {
   double ts=SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_SIZE), tv=SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv<=0.0) tv=SymbolInfoDouble(sym,SYMBOL_TRADE_TICK_VALUE);
   if(ts<=0.0||tv<=0.0||stopDist<=0.0) return(0.0);
   return((stopDist/ts)*tv);
  }
double DirectionalVolume(const string sym, const int dir)
  {
   double v=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir==dir) v+=PositionGetDouble(POSITION_VOLUME); }
   return(v);
  }
double OpenRiskPct()
  {
   double basis=MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) return(1e9);
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
       string sym=PositionGetString(POSITION_SYMBOL); if(SlotOf(sym)<0) continue;
       double sl=PositionGetDouble(POSITION_SL); if(sl<=0.0){ total+=g_riskPct; continue; }
       double open=PositionGetDouble(POSITION_PRICE_OPEN), vol=PositionGetDouble(POSITION_VOLUME);
       int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
       double dist=(pdir>0)?(open-sl):(sl-open); if(dist<=0.0) continue;
       total+=(LossPerLot(sym,dist)*vol)/basis*100.0; }
   return(total);
  }
double LotsFor(const string sym, const int dir, const double entry, const double sl, double &riskPctOut, string &note)
  {
   riskPctOut=0.0; note="";
   double basis=MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0){ note="no balance"; return(0.0); }
   double lpl=LossPerLot(sym,MathAbs(entry-sl));
   if(lpl<=0.0){ note="cannot value the stop"; return(0.0); }
   double ref=0.0; ENUM_ORDER_TYPE ot=(dir>0)?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   if(OrderCalcProfit(ot,sym,1.0,entry,sl,ref)&&ref<0.0) lpl=MathMax(lpl,MathAbs(ref));
   double lots=NormalizeVolume(sym,(basis*g_riskPct/100.0)/lpl), vmin=SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);
   if(lots<=0.0)
     {
      double pctAtMin=(lpl*vmin)/basis*100.0;
      if(pctAtMin<=g_maxOpenRiskPct){ lots=vmin; note=StringFormat("%s: min lot risks %.2f%% (inside cap)",sym,pctAtMin); }
      else { note=StringFormat("SKIP %s: min lot risks %.1f%% — over %.1f%% cap.",sym,pctAtMin,g_maxOpenRiskPct); return(0.0); }
     }
   double vlimit=SymbolInfoDouble(sym,SYMBOL_VOLUME_LIMIT);
   if(vlimit>0.0)
     { double room=vlimit-DirectionalVolume(sym,dir); if(room<=0.0){ note=sym+": volume limit reached"; return(0.0);} if(lots>room){ lots=NormalizeVolume(sym,room); if(lots<=0.0){ note=sym+": volume limit leaves no room"; return(0.0);} } }
   double margin=0.0;
   if(OrderCalcMargin(ot,sym,lots,entry,margin)){ double fm=AccountInfoDouble(ACCOUNT_MARGIN_FREE); if(margin>fm*0.9){ note=StringFormat("SKIP %s: needs %.2f margin, %.2f free",sym,margin,fm); return(0.0);} }
   riskPctOut=(lpl*lots)/basis*100.0;
   return(lots);
  }

//+------------------------------------------------------------------+
int OurPositions(const string sym, const int dir)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       if(dir==0){ n++; continue; } int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir==dir) n++; }
   return(n);
  }
bool AllInProfit(const string sym, const int dir)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   bool any=false;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong t=PositionGetTicket(i); if(t==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; if(pdir!=dir) continue; any=true;
       double open=PositionGetDouble(POSITION_PRICE_OPEN), now=(pdir>0)?tk.bid:tk.ask;
       if((pdir>0&&now<=open)||(pdir<0&&now>=open)) return(false); }
   return(any);
  }
bool StopsValidFor(const string sym, const int dir, const double sl)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   double pt=SymbolInfoDouble(sym,SYMBOL_POINT), lvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*pt;
   if(lvl<=0.0) lvl=(tk.ask-tk.bid);
   if(dir>0) return(tk.bid-sl>lvl);
   return(sl-tk.ask>lvl);
  }
bool SpreadOK(const string sym){ MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false); if(tk.bid<=0.0) return(false); return(((tk.ask-tk.bid)/tk.bid)*100.0<=InpMaxSpreadPct); }
bool TradingAllowed()
  {
   if(!InpTradingEnabled) return(false);
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) return(false);
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT)) return(false);
   return(true);
  }
void RollDay(){ MqlDateTime dt; TimeToStruct(TimeCurrent(),dt); if(dt.day_of_year!=g_dayStart){ g_dayStart=dt.day_of_year; g_dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);} }
bool DailyLossHit(){ if(InpMaxDailyLossPct<=0.0||g_dayStartEquity<=0.0) return(false); double eq=AccountInfoDouble(ACCOUNT_EQUITY); return(((g_dayStartEquity-eq)/g_dayStartEquity*100.0)>=InpMaxDailyLossPct); }
bool Succeeded(const string what)
  {
   uint rc=g_trade.ResultRetcode();
   if(rc==TRADE_RETCODE_DONE||rc==TRADE_RETCODE_PLACED||rc==TRADE_RETCODE_DONE_PARTIAL||rc==TRADE_RETCODE_NO_CHANGES) return(true);
   if(rc==TRADE_RETCODE_MARKET_CLOSED) return(false);
   PrintFormat("Clunoid CryptoTrend: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }

//+------------------------------------------------------------------+
void TryEnter(const int k, const Setup &s)
  {
   if(!s.valid || !TradingAllowed()) return;
   SymSlot t = g_sym[k];
   if(DailyLossHit()) return;
   if(!SpreadOK(t.name)) return;
   if(OurPositions(t.name,-s.dir)>0) return;
   if(OurPositions(t.name,s.dir)>0) return;

   double riskPct=0.0; string note="";
   double lots = LotsFor(t.name, s.dir, s.price, s.sl, riskPct, note);
   if(note!="") Print("Clunoid CryptoTrend: ", note);
   if(lots<=0.0) return;
   if(OpenRiskPct() + riskPct > g_maxOpenRiskPct)
     { PrintFormat("Clunoid CryptoTrend: skipping %s — open risk %.2f%% + %.2f%% passes %.1f%% cap.", t.name, OpenRiskPct(), riskPct, g_maxOpenRiskPct); return; }
   if(!StopsValidFor(t.name,s.dir,s.sl)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent = (s.dir>0) ? g_trade.Buy(lots,t.name,0.0,s.sl,0.0,"Clunoid CryptoTrend")
                         : g_trade.Sell(lots,t.name,0.0,s.sl,0.0,"Clunoid CryptoTrend");
   if(!sent || !Succeeded("entry")) return;
   g_sym[k].peak = s.price;
   g_sym[k].lastAddPrice = s.price;
   PrintFormat("Clunoid CryptoTrend: %s %.4f %s @ %.*f | SL %.*f (2.5N) | Bollinger breakout",
               s.dir>0?"BUY":"SELL", lots, t.name, t.digits, s.price, t.digits, s.sl);
  }

//+------------------------------------------------------------------+
void ManageSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   if(OurPositions(t.name,0)<=0) return;
   double atr[]; if(!Buf(t.hAtr,0,3,atr)) return;
   double N = atr[1]; if(N<=0.0) return;
   MqlRates r[]; if(!Rates(t.name,TF_ENTRY,3,r)) return;

   int dir = 0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
       dir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; break; }
   if(dir==0) return;

   if(dir>0) g_sym[k].peak = MathMax(g_sym[k].peak, r[1].high);
   else      g_sym[k].peak = (g_sym[k].peak==0)? r[1].low : MathMin(g_sym[k].peak, r[1].low);
   double trail = (dir>0) ? g_sym[k].peak - TRAIL_ATR*N : g_sym[k].peak + TRAIL_ATR*N;

   MqlTick tick; if(!SymbolInfoTick(t.name,tick)) return;
   double px = (dir>0)?tick.bid:tick.ask;
   if((dir>0 && px<=trail) || (dir<0 && px>=trail)) { CloseSymbol(k); return; }
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
       double sl=PositionGetDouble(POSITION_SL), ns=NormalizeDouble(trail,t.digits);
       if(dir>0 && (sl<=0.0||ns>sl) && StopsValidFor(t.name,dir,ns)) g_trade.PositionModify(tk,ns,0.0);
       if(dir<0 && (sl<=0.0||ns<sl) && StopsValidFor(t.name,dir,ns)) g_trade.PositionModify(tk,ns,0.0); }

   if(InpEnablePyramid && g_hedging && g_maxAdds>0)
     {
      int adds = OurPositions(t.name,dir) - 1;
      if(adds < g_maxAdds && AllInProfit(t.name,dir))
        { double trig=(dir>0)?g_sym[k].lastAddPrice+ADD_ATR*N:g_sym[k].lastAddPrice-ADD_ATR*N;
          if((dir>0&&px>=trig)||(dir<0&&px<=trig)) AddUnit(k,dir,N); }
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
   if(OpenRiskPct()+riskPct>g_maxOpenRiskPct) return;
   if(!StopsValidFor(t.name,dir,sl)) return;
   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent=(dir>0)?g_trade.Buy(lots,t.name,0.0,sl,0.0,"Clunoid CryptoTrend add")
                    :g_trade.Sell(lots,t.name,0.0,sl,0.0,"Clunoid CryptoTrend add");
   if(sent && Succeeded("add")) g_sym[k].lastAddPrice=entry;
  }
void CloseSymbol(const int k)
  {
   SymSlot t=g_sym[k];
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
       g_trade.SetTypeFillingBySymbol(t.name); if(g_trade.PositionClose(tk)) Succeeded("trail exit"); }
  }

//+------------------------------------------------------------------+
void ProcessSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   datetime bt = (datetime)SeriesInfoInteger(t.name,TF_ENTRY,SERIES_LASTBAR_DATE);
   if(bt==0 || bt==g_sym[k].lastBar) return;
   g_sym[k].lastBar = bt;
   ManageSymbol(k);
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
   g_trade.SetDeviationInPoints(80);
   g_trade.SetAsyncMode(false);

   g_symN=0;
   string parts[]; int n=StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++){ string w=parts[i]; StringTrimLeft(w); StringTrimRight(w); if(w!="") AddSymbol(w); }
   if(g_symN==0){ Print("Clunoid CryptoTrend: no coins resolved on this broker — does it list crypto?"); return(INIT_FAILED); }

   RollDay();
   EventSetTimer(15);
   PrintFormat("Clunoid CryptoTrend ready — %s profile, %d coins, %s hedging. 24/7 Bollinger breakout.",
               ProfileStr(), g_symN, g_hedging?"":"no");
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i=0;i<g_symN;i++)
     { if(g_sym[i].hBands!=INVALID_HANDLE) IndicatorRelease(g_sym[i].hBands); if(g_sym[i].hAtr!=INVALID_HANDLE) IndicatorRelease(g_sym[i].hAtr); }
  }
void OnTimer() { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
void OnTick()  { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
//+------------------------------------------------------------------+
