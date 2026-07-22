//+------------------------------------------------------------------+
//|                                            ClunoidDipMT5.mq5      |
//|   Clunoid MetaTrader 5 — INDEX DIP REVERSION (Connors RSI-2)      |
//|                                                                   |
//|   Runs on ANY MT5 broker. Self-contained: no internet, no Clunoid |
//|   account — every decision is made on YOUR terminal from YOUR     |
//|   broker's own daily prices.                                      |
//|                                                                   |
//|   THE EDGE (documented)                                           |
//|   Stock indices show short-horizon RETURN REVERSAL — a sharp dip  |
//|   inside an ongoing uptrend tends to bounce (Jegadeesh 1990;      |
//|   Lehmann 1990; Lo & MacKinlay 1988; popularised as Connors'      |
//|   RSI-2). It is the OPPOSITE of trend-following and only holds on  |
//|   indices, NOT trending FX — so this bot trades indices, long only.|
//|                                                                   |
//|   RULES                                                           |
//|   Only when the index is above its 200-day average (buy dips in   |
//|   uptrends, never catch a falling knife): buy when 2-day RSI drops |
//|   below 10 (deeply oversold); exit when price closes back above    |
//|   its 5-day average (the bounce has played out), with a hard 3N    |
//|   ATR stop as the disaster brake.                                 |
//|                                                                   |
//|   VALIDATION (Clunoid, 15y daily, 8 indices, selection-free, net  |
//|   of spread): +134% total, both halves +44% / +63% (robust),      |
//|   profit factor 1.25, 71% win rate, ~18 trades a month. A HIGH-    |
//|   win-rate, high-frequency system — the mirror of the trend bot.  |
//|                                                                   |
//|   PRINCIPLES: hard stop on every trade, volatility sizing that     |
//|   fits any balance, a portfolio-wide risk cap, a clean fast exit   |
//|   when conditions normalise. Mean reversion does NOT add to        |
//|   winners (you are fading, not trending) — the discipline here is  |
//|   a tight, quick exit, not pyramiding.                            |
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
input double      InpMaxDailyLossPct = 6.0;        // Halt new entries after this daily loss (% of day-start equity)

input group           "=== Markets ==="
// Stock indices only — the effect does not hold on trending FX. The EA resolves
// whatever your broker offers (names auto-matched); more indices = more trades.
input string      InpSymbols         = "US500,US30,NAS100,US2000,GER40,UK100,JP225,HK50,FRA40,EU50,AUS200"; // Indices (comma separated)
input double      InpMaxSpreadPct    = 0.05;       // Skip entries when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input long        InpMagic           = 77120556;   // Magic number (this EA's trades only)

//--- strategy constants — these ARE the validated configuration -------------
#define RSI_PERIOD    2      // 2-day RSI (deeply responsive oversold gauge)
#define ENTRY_RSI     10.0   // buy when RSI(2) < this (oversold dip)
#define TREND_SMA     200    // only buy dips ABOVE this average (uptrend filter)
#define EXIT_SMA      5      // exit when price closes back above this average
#define RSI_EXIT      65.0   // backup exit if RSI(2) rebounds strongly
#define ATR_PERIOD    20
#define STOP_ATR      3.0    // hard disaster stop = 3N
#define MAX_HOLD_DAYS 12     // time stop — a dip that hasn't reverted in 12 days is wrong
#define RATES_N       260    // daily bars pulled (must exceed TREND_SMA + margins)
#define MAX_SYMBOLS   16

#define TF_ENTRY      PERIOD_D1

double  g_riskPct, g_maxOpenRiskPct;

struct SymSlot
  {
   string   name;
   int      digits;
   double   point;
   int      hRsi;
   int      hSmaT;   // 200-day trend SMA
   int      hSmaX;   // 5-day exit SMA
   int      hAtr;
   datetime lastBar;
   datetime entryBar;
  };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;

struct Setup { bool valid; double price, sl; double risk; string why; };

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    { g_riskPct=1.00; g_maxOpenRiskPct=8.0; }
   else if(InpProfile==MODERATE) { g_riskPct=0.60; g_maxOpenRiskPct=5.0; }
   else                          { g_riskPct=0.35; g_maxOpenRiskPct=3.0; }
   if(InpRiskPctOverride>0.0) g_riskPct = InpRiskPctOverride;
  }
string ProfileStr()
  { if(InpProfile==AGGRESSIVE) return("Aggressive"); if(InpProfile==MODERATE) return("Moderate"); return("Conservative"); }

//+------------------------------------------------------------------+
//| Symbol resolution — portable "contains" match.                    |
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
   if(s=="") { PrintFormat("Clunoid Dip: '%s' not tradable here — skipping.", want); return(false); }
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==s) return(false);

   SymSlot slot;
   slot.name=s;
   slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS);
   slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.entryBar=0;
   slot.hRsi  = iRSI(s, TF_ENTRY, RSI_PERIOD, PRICE_CLOSE);
   slot.hSmaT = iMA(s, TF_ENTRY, TREND_SMA, 0, MODE_SMA, PRICE_CLOSE);
   slot.hSmaX = iMA(s, TF_ENTRY, EXIT_SMA, 0, MODE_SMA, PRICE_CLOSE);
   slot.hAtr  = iATR(s, TF_ENTRY, ATR_PERIOD);
   if(slot.hRsi==INVALID_HANDLE || slot.hSmaT==INVALID_HANDLE || slot.hSmaX==INVALID_HANDLE || slot.hAtr==INVALID_HANDLE)
     { PrintFormat("Clunoid Dip: indicators failed for %s (err %d)", s, GetLastError()); return(false); }
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
  { ArraySetAsSeries(out,true); return(CopyRates(sym,tf,0,count,out) == count); }
int SlotOf(const string sym)
  { for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i); return(-1); }

//+------------------------------------------------------------------+
//| STRATEGY — RSI-2 dip in an uptrend. Long only.                    |
//+------------------------------------------------------------------+
Setup BuildSetup(const int k)
  {
   Setup s; s.valid=false; s.price=0; s.sl=0; s.risk=0; s.why="";
   SymSlot t = g_sym[k];

   double rsi[], smaT[], atr[];
   if(!Buf(t.hRsi,0,3,rsi) || !Buf(t.hSmaT,0,3,smaT) || !Buf(t.hAtr,0,3,atr))
     { s.why="indicators not ready"; return(s); }
   double N = atr[1];
   if(N<=0.0) { s.why="no ATR"; return(s); }

   MqlRates r[];
   if(!Rates(t.name,TF_ENTRY,3,r)) { s.why="rates not ready"; return(s); }
   double close = r[1].close;

   if(!(close > smaT[1]))   { s.why="below 200-day trend"; return(s); }   // uptrend only
   if(!(rsi[1] < ENTRY_RSI)){ s.why="not oversold";        return(s); }   // dip only

   MqlTick tk;
   if(!SymbolInfoTick(t.name,tk)) { s.why="no tick"; return(s); }
   double entry = tk.ask;
   double risk  = STOP_ATR * N;
   s.price = entry;
   s.sl    = NormalizeDouble(entry - risk, t.digits);
   s.risk  = risk;
   s.valid = true; s.why = "oversold dip in uptrend";
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
   if(vmax>0.0 && lots>vmax) lots = NormalizeDouble(MathFloor(NormalizeDouble(vmax/vstep,8))*vstep,8);
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
double OpenRiskPct()
  {
   double basis = MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) return(1e9);
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string sym = PositionGetString(POSITION_SYMBOL);
      if(SlotOf(sym)<0) continue;
      double sl = PositionGetDouble(POSITION_SL);
      if(sl<=0.0) { total += g_riskPct; continue; }
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      double dist = open - sl;                         // long only
      if(dist<=0.0) continue;
      total += (LossPerLot(sym,dist)*vol)/basis*100.0;
     }
   return(total);
  }
double LotsFor(const string sym, const double entry, const double sl, double &riskPctOut, string &note)
  {
   riskPctOut = 0.0; note = "";
   double basis = MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) { note="no balance"; return(0.0); }
   double stopDist = MathAbs(entry-sl);
   double lpl = LossPerLot(sym,stopDist);
   if(lpl<=0.0) { note="cannot value the stop"; return(0.0); }
   double ref=0.0;
   if(OrderCalcProfit(ORDER_TYPE_BUY,sym,1.0,entry,sl,ref) && ref<0.0) lpl = MathMax(lpl, MathAbs(ref));
   double budget = basis * g_riskPct / 100.0;
   double lots   = NormalizeVolume(sym, budget / lpl);
   double vmin   = SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);
   if(lots<=0.0)
     {
      double pctAtMin = (lpl*vmin)/basis*100.0;
      if(pctAtMin <= g_maxOpenRiskPct)
        { lots=vmin; note=StringFormat("%s: min lot %.4f risks %.2f%% (inside %.1f%% cap)",sym,vmin,pctAtMin,g_maxOpenRiskPct); }
      else { note=StringFormat("SKIP %s: min lot risks %.1f%% — over %.1f%% cap.",sym,pctAtMin,g_maxOpenRiskPct); return(0.0); }
     }
   double margin=0.0;
   if(OrderCalcMargin(ORDER_TYPE_BUY,sym,lots,entry,margin))
     {
      double fm = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(margin > fm*0.9) { note=StringFormat("SKIP %s: needs %.2f margin, %.2f free",sym,margin,fm); return(0.0); }
     }
   riskPctOut = (lpl*lots)/basis*100.0;
   return(lots);
  }

//+------------------------------------------------------------------+
int OurPositions(const string sym)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)==sym) n++;
     }
   return(n);
  }
bool StopsValidFor(const string sym, const double sl)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   double pt=SymbolInfoDouble(sym,SYMBOL_POINT);
   double lvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*pt;
   if(lvl<=0.0) lvl=(tk.ask-tk.bid);
   return(tk.bid - sl > lvl);      // long: SL below Bid by the stops level
  }
bool SpreadOK(const string sym)
  { MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false); if(tk.bid<=0.0) return(false); return(((tk.ask-tk.bid)/tk.bid)*100.0 <= InpMaxSpreadPct); }
bool TradingAllowed()
  {
   if(!InpTradingEnabled) return(false);
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED)) return(false);
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT)) return(false);
   return(true);
  }
void RollDay()
  { MqlDateTime dt; TimeToStruct(TimeCurrent(),dt); if(dt.day_of_year!=g_dayStart){ g_dayStart=dt.day_of_year; g_dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY);} }
bool DailyLossHit()
  { if(InpMaxDailyLossPct<=0.0||g_dayStartEquity<=0.0) return(false); double eq=AccountInfoDouble(ACCOUNT_EQUITY); return(((g_dayStartEquity-eq)/g_dayStartEquity*100.0)>=InpMaxDailyLossPct); }
bool Succeeded(const string what)
  {
   uint rc=g_trade.ResultRetcode();
   if(rc==TRADE_RETCODE_DONE||rc==TRADE_RETCODE_PLACED||rc==TRADE_RETCODE_DONE_PARTIAL||rc==TRADE_RETCODE_NO_CHANGES) return(true);
   if(rc==TRADE_RETCODE_MARKET_CLOSED) return(false);
   PrintFormat("Clunoid Dip: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
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
   if(OurPositions(t.name)>0) return;                 // one dip position per index

   double riskPct=0.0; string note="";
   double lots = LotsFor(t.name, s.price, s.sl, riskPct, note);
   if(note!="") Print("Clunoid Dip: ", note);
   if(lots<=0.0) return;
   if(OpenRiskPct() + riskPct > g_maxOpenRiskPct)
     { PrintFormat("Clunoid Dip: skipping %s — open risk %.2f%% + %.2f%% passes %.1f%% cap.", t.name, OpenRiskPct(), riskPct, g_maxOpenRiskPct); return; }
   if(!StopsValidFor(t.name,s.sl)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   if(!g_trade.Buy(lots,t.name,0.0,s.sl,0.0,"Clunoid Dip") || !Succeeded("entry")) return;
   g_sym[k].entryBar = (datetime)SeriesInfoInteger(t.name,TF_ENTRY,SERIES_LASTBAR_DATE);
   PrintFormat("Clunoid Dip: BUY %.4f %s @ %.*f | SL %.*f (3N) | RSI-2 dip in uptrend",
               lots, t.name, t.digits, s.price, t.digits, s.sl);
  }

//+------------------------------------------------------------------+
//| MANAGE — exit when the bounce completes (close > 5-day SMA), on a  |
//| strong RSI rebound, on the time stop, or on the hard 3N stop.     |
//+------------------------------------------------------------------+
void ManageSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   if(OurPositions(t.name)<=0) return;

   double rsi[], smaX[];
   if(!Buf(t.hRsi,0,3,rsi) || !Buf(t.hSmaX,0,3,smaX)) return;
   MqlRates r[]; if(!Rates(t.name,TF_ENTRY,3,r)) return;
   double close = r[1].close;

   bool exit = (close > smaX[1]) || (rsi[1] >= RSI_EXIT);

   // time stop
   if(!exit && t.entryBar>0)
     {
      datetime nowBar = (datetime)SeriesInfoInteger(t.name,TF_ENTRY,SERIES_LASTBAR_DATE);
      int held = (int)((nowBar - t.entryBar) / PeriodSeconds(TF_ENTRY));
      if(held >= MAX_HOLD_DAYS) exit = true;
     }
   if(!exit) return;

   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;
      g_trade.SetTypeFillingBySymbol(t.name);
      if(g_trade.PositionClose(tk)) Succeeded("exit");
     }
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
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetAsyncMode(false);

   g_symN=0;
   string parts[]; int n=StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++){ string w=parts[i]; StringTrimLeft(w); StringTrimRight(w); if(w!="") AddSymbol(w); }
   if(g_symN==0) { Print("Clunoid Dip: none of the index basket resolved on this broker."); return(INIT_FAILED); }

   RollDay();
   EventSetTimer(15);
   PrintFormat("Clunoid Dip ready — %s profile, %d indices. Long-only RSI-2 dip reversion.", ProfileStr(), g_symN);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i=0;i<g_symN;i++)
     {
      if(g_sym[i].hRsi!=INVALID_HANDLE)  IndicatorRelease(g_sym[i].hRsi);
      if(g_sym[i].hSmaT!=INVALID_HANDLE) IndicatorRelease(g_sym[i].hSmaT);
      if(g_sym[i].hSmaX!=INVALID_HANDLE) IndicatorRelease(g_sym[i].hSmaX);
      if(g_sym[i].hAtr!=INVALID_HANDLE)  IndicatorRelease(g_sym[i].hAtr);
     }
  }
void OnTimer() { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
void OnTick()  { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
//+------------------------------------------------------------------+
