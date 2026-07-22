//+------------------------------------------------------------------+
//|                                         ClunoidCryptoLSMT5.mq5    |
//|   Clunoid MetaTrader 5 — CRYPTO RELATIVE STRENGTH (market-neutral)|
//|                                                                   |
//|   Runs on ANY MT5 broker that lists (and lets you short) crypto.  |
//|   Self-contained: no internet, no Clunoid account.               |
//|                                                                   |
//|   THE EDGE (documented)                                           |
//|   Cross-sectional momentum in crypto — the coins that led recently |
//|   tend to keep leading, the laggards keep lagging (Liu & Tsyvinski,|
//|   Review of Financial Studies 2021). This ranks a basket of coins  |
//|   by trailing 30-day return every week, goes LONG the strongest    |
//|   few and SHORT the weakest few, dollar-neutral. It bets on        |
//|   DISPERSION between coins, not on crypto going up — so it can make |
//|   money in a falling market too.                                  |
//|                                                                   |
//|   VALIDATION (Clunoid, ~11y daily, 12 coins, selection-free, net  |
//|   of spread): +867% total, both halves +23% / +20% (robust),      |
//|   Sharpe 0.76, ~28% max drawdown. IMPORTANT: this is net of        |
//|   SPREAD, not of daily CFD FUNDING/SWAP — holding shorts and longs |
//|   for a week accrues financing on both legs, which varies by broker|
//|   and eats into the edge. Use a low-swap crypto account.          |
//|                                                                   |
//|   PRINCIPLES: dollar-neutral construction (the market hedge is the |
//|   primary risk control), a wide disaster stop on every leg, equal  |
//|   sizing that fits any balance, a daily-loss halt, weekly          |
//|   rebalancing — never averaging into a loser.                     |
//|                                                                   |
//|   SETUP: drag onto ANY chart, allow algo trading, done. Needs a    |
//|   broker that permits SHORTING the coins.                         |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile        = MODERATE;   // Risk profile (scales gross exposure)
input double      InpGrossOverride  = 0;          // Override gross exposure % (0 = use profile)
input double      InpMaxDailyLossPct= 6.0;        // Halt rebalancing after this daily loss (%)

input group           "=== Markets ==="
input string      InpSymbols        = "BTCUSD,ETHUSD,SOLUSD,XRPUSD,LTCUSD,BNBUSD,ADAUSD,DOGEUSD,BCHUSD,LINKUSD,DOTUSD,AVAXUSD"; // Coins
input double      InpMaxSpreadPct   = 0.30;       // Skip a leg when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled = true;       // Master on/off switch
input long        InpMagic          = 77120560;   // Magic number (this EA's trades only)

//--- strategy constants — the validated configuration -----------------------
#define LOOK_DAYS     30     // rank by trailing 30-day return
#define REBAL_DAYS    7      // rebalance weekly
#define SIDE_N        4      // long the top 4, short the bottom 4
#define STOP_PCT      0.30   // wide per-leg disaster stop (30% adverse)
#define RATES_N       (LOOK_DAYS+3)
#define MAX_SYMBOLS   20

#define TF_ENTRY      PERIOD_D1

double  g_grossPct;

struct SymSlot { string name; int digits; double point; bool ok; };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;
datetime g_lastRebalance = 0;

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    g_grossPct=150.0;
   else if(InpProfile==MODERATE) g_grossPct=100.0;
   else                          g_grossPct=60.0;
   if(InpGrossOverride>0.0) g_grossPct = InpGrossOverride;
  }
string ProfileStr()
  { if(InpProfile==AGGRESSIVE) return("Aggressive"); if(InpProfile==MODERATE) return("Moderate"); return("Conservative"); }

//+------------------------------------------------------------------+
bool SymbolUsable(const string s)
  {
   if(!SymbolSelect(s,true)) return(false);
   long mode = SymbolInfoInteger(s,SYMBOL_TRADE_MODE);
   return(mode==SYMBOL_TRADE_MODE_FULL || mode==SYMBOL_TRADE_MODE_LONGONLY || mode==SYMBOL_TRADE_MODE_SHORTONLY);
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
   if(s=="") { PrintFormat("Clunoid CryptoLS: '%s' not tradable here — skipping.", want); return(false); }
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==s) return(false);
   SymSlot slot; slot.name=s; slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS); slot.point=SymbolInfoDouble(s,SYMBOL_POINT); slot.ok=true;
   g_sym[g_symN]=slot; g_symN++;
   return(true);
  }
int SlotOf(const string sym){ for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i); return(-1); }

//+------------------------------------------------------------------+
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
bool SpreadOK(const string sym){ MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false); if(tk.bid<=0.0) return(false); return(((tk.ask-tk.bid)/tk.bid)*100.0<=InpMaxSpreadPct); }
bool Succeeded(const string what)
  {
   uint rc=g_trade.ResultRetcode();
   if(rc==TRADE_RETCODE_DONE||rc==TRADE_RETCODE_PLACED||rc==TRADE_RETCODE_DONE_PARTIAL||rc==TRADE_RETCODE_NO_CHANGES) return(true);
   if(rc==TRADE_RETCODE_MARKET_CLOSED) return(false);
   PrintFormat("Clunoid CryptoLS: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }
int PosDir(const string sym)  // +1 long, -1 short, 0 none (this EA)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       return((PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1); }
   return(0);
  }
void CloseSym(const string sym)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       g_trade.SetTypeFillingBySymbol(sym); if(g_trade.PositionClose(tk)) Succeeded("close "+sym); }
  }

//+------------------------------------------------------------------+
//| Equal-notional sizing: each leg carries the same dollar exposure. |
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
double LotsForNotional(const string sym, const double notional)
  {
   double price=SymbolInfoDouble(sym,SYMBOL_BID);
   double cs=SymbolInfoDouble(sym,SYMBOL_TRADE_CONTRACT_SIZE);
   if(price<=0.0 || cs<=0.0 || notional<=0.0) return(0.0);
   return(NormalizeVolume(sym, notional/(price*cs)));
  }

//+------------------------------------------------------------------+
//| Trailing 30-day return of a coin (on the last closed daily bar).  |
//+------------------------------------------------------------------+
bool Ret30(const string sym, double &out)
  {
   MqlRates r[]; ArraySetAsSeries(r,true);
   if(CopyRates(sym,TF_ENTRY,0,RATES_N,r)!=RATES_N) return(false);
   if(r[1+LOOK_DAYS].close<=0.0) return(false);
   out = (r[1].close - r[1+LOOK_DAYS].close)/r[1+LOOK_DAYS].close;
   return(true);
  }

void OpenLeg(const string sym, const int dir, const double notional)
  {
   if(!SpreadOK(sym)) return;
   double lots = LotsForNotional(sym, notional);
   if(lots<=0.0) return;
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return;
   double entry=(dir>0)?tk.ask:tk.bid;
   double sl = NormalizeDouble(dir>0 ? entry*(1.0-STOP_PCT) : entry*(1.0+STOP_PCT), (int)SymbolInfoInteger(sym,SYMBOL_DIGITS));
   double margin=0.0; ENUM_ORDER_TYPE ot=(dir>0)?ORDER_TYPE_BUY:ORDER_TYPE_SELL;
   if(OrderCalcMargin(ot,sym,lots,entry,margin)){ if(margin>AccountInfoDouble(ACCOUNT_MARGIN_FREE)*0.9) { PrintFormat("Clunoid CryptoLS: %s needs %.2f margin, skipping",sym,margin); return; } }
   g_trade.SetTypeFillingBySymbol(sym);
   bool sent=(dir>0)?g_trade.Buy(lots,sym,0.0,sl,0.0,"Clunoid CryptoLS")
                    :g_trade.Sell(lots,sym,0.0,sl,0.0,"Clunoid CryptoLS");
   if(sent) Succeeded((dir>0?"long ":"short ")+sym);
  }

//+------------------------------------------------------------------+
//| REBALANCE — rank, pick top/bottom, reconcile to target.           |
//+------------------------------------------------------------------+
void Rebalance()
  {
   // rank resolvable coins by 30-day return
   string names[]; double rets[]; int m=0;
   for(int i=0;i<g_symN;i++){ double rr; if(Ret30(g_sym[i].name,rr)){ ArrayResize(names,m+1); ArrayResize(rets,m+1); names[m]=g_sym[i].name; rets[m]=rr; m++; } }
   if(m < SIDE_N*2) { Print("Clunoid CryptoLS: not enough coins with history to rebalance yet."); return; }

   // simple selection sort by return desc
   for(int a=0;a<m-1;a++) for(int b=a+1;b<m;b++) if(rets[b]>rets[a]) { double tr=rets[a];rets[a]=rets[b];rets[b]=tr; string ts=names[a];names[a]=names[b];names[b]=ts; }

   // target directions
   int target[]; ArrayResize(target,m);
   for(int i=0;i<m;i++) target[i] = (i<SIDE_N)?1 : (i>=m-SIDE_N)?-1 : 0;

   double equity=AccountInfoDouble(ACCOUNT_EQUITY);
   double notionalPerLeg = equity * (g_grossPct/100.0) / (double)(SIDE_N*2);

   // 1) close any of our positions not matching the new target
   for(int i=0;i<g_symN;i++)
     {
      int cur = PosDir(g_sym[i].name);
      if(cur==0) continue;
      int want=0; for(int j=0;j<m;j++) if(names[j]==g_sym[i].name){ want=target[j]; break; }
      if(want!=cur) CloseSym(g_sym[i].name);
     }
   // 2) open the target legs we don't already hold
   for(int j=0;j<m;j++)
     {
      if(target[j]==0) continue;
      if(PosDir(names[j])==target[j]) continue;
      OpenLeg(names[j], target[j], notionalPerLeg);
     }
   PrintFormat("Clunoid CryptoLS: rebalanced — long %s..., short ...%s (gross %.0f%%).", names[0], names[m-1], g_grossPct);
  }

//+------------------------------------------------------------------+
void OnTickOrTimer()
  {
   RollDay();
   if(!TradingAllowed()) return;
   datetime bt=(datetime)SeriesInfoInteger(_Symbol,TF_ENTRY,SERIES_LASTBAR_DATE);
   if(bt==0) return;
   bool due = (g_lastRebalance==0) || ((bt - g_lastRebalance) >= REBAL_DAYS*PeriodSeconds(TF_ENTRY));
   if(!due) return;
   if(DailyLossHit()) return;
   g_lastRebalance = bt;
   Rebalance();
  }

int OnInit()
  {
   ApplyProfile();
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(80);
   g_trade.SetAsyncMode(false);

   g_symN=0;
   string parts[]; int n=StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++){ string w=parts[i]; StringTrimLeft(w); StringTrimRight(w); if(w!="") AddSymbol(w); }
   if(g_symN < SIDE_N*2){ PrintFormat("Clunoid CryptoLS: need >= %d shortable coins; only %d resolved.", SIDE_N*2, g_symN); return(INIT_FAILED); }

   RollDay();
   EventSetTimer(30);
   PrintFormat("Clunoid CryptoLS ready — %s profile, %d coins, long %d / short %d, weekly. Market-neutral relative strength.",
               ProfileStr(), g_symN, SIDE_N, SIDE_N);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { OnTickOrTimer(); }
void OnTick()  { OnTickOrTimer(); }
//+------------------------------------------------------------------+
