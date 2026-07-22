//+------------------------------------------------------------------+
//|                                            ClunoidORBMT5.mq5      |
//|   Clunoid MetaTrader 5 — OPENING RANGE BREAKOUT (index intraday)  |
//|                                                                   |
//|   Runs on ANY MT5 broker. Self-contained: no internet, no Clunoid |
//|   account.                                                        |
//|                                                                   |
//|   THE EDGE (documented)                                           |
//|   Opening-range breakout: the first hour of the session sets a    |
//|   range; a break of it tends to run for the rest of the day       |
//|   (Toby Crabel; Zarattini & Aziz 2023 on US equities). This trades |
//|   stock indices once a day: build the first-hour high/low, take a  |
//|   break of it WITH a stop at the other side of the range and a 2R  |
//|   target, then flat by the session close.                         |
//|                                                                   |
//|   VALIDATION (Clunoid, ~2y hourly, 3 US indices, selection-free,  |
//|   net of spread): profit factor 1.22, both halves 1.25 / 1.19     |
//|   (robust), ~1 trade a day per index. NOTE this is a SHORTER,      |
//|   HOURLY evidence base than the trend/reversion bots (multi-year   |
//|   daily), because intraday history is limited — treat accordingly. |
//|                                                                   |
//|   *** SET THE SESSION HOUR *** InpSessionStartHour is your BROKER  |
//|   SERVER time for the US index cash open (09:30 New York). Most    |
//|   GMT+2/+3 brokers = 15 or 16; check your broker and adjust, or    |
//|   the opening range is built at the wrong time and the edge is     |
//|   lost. Attach to a stock-index chart (US500 / US30 / NAS100).    |
//|                                                                   |
//|   PRINCIPLES: hard stop on every trade (the range's far side),     |
//|   a fixed 2R target, volatility/risk sizing for any balance, one   |
//|   trade per day, always flat overnight.                           |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile          = MODERATE;  // Risk profile
input double      InpRiskPctOverride   = 0;         // Override risk % per trade (0 = use profile)
input double      InpMaxDailyLossPct   = 5.0;       // Halt new entries after this daily loss (%)

input group           "=== Session (SERVER time!) ==="
input int         InpSessionStartHour  = 15;        // Broker-server hour of the US index open (09:30 NY) — ADJUST
input int         InpSessionEndHour    = 21;        // Broker-server hour to force-flat by (before US close)
input double      InpTargetR           = 2.0;       // Take-profit as a multiple of the opening range

input group           "=== Markets ==="
input string      InpSymbols           = "US500,US30,NAS100,US2000,GER40"; // Stock indices (comma separated)
input double      InpMaxSpreadPct      = 0.05;      // Skip entries when spread exceeds this % of price

input group           "=== Behaviour ==="
input bool        InpTradingEnabled    = true;      // Master on/off switch
input long        InpMagic             = 77120558;  // Magic number (this EA's trades only)

#define TF_ENTRY      PERIOD_H1
#define OR_HOURS      1        // opening range = first hour of the session
#define MAX_SYMBOLS   10

double  g_riskPct, g_maxOpenRiskPct;

struct SymSlot
  {
   string   name;
   int      digits;
   double   point;
   datetime lastBar;
   int      day;          // day-of-year this state belongs to
   bool     orReady;      // opening range finished forming
   bool     traded;       // already took today's trade
   double   orHigh, orLow;
  };
SymSlot g_sym[MAX_SYMBOLS];
int     g_symN = 0;

CTrade   g_trade;
double   g_dayStartEquity = 0.0;
int      g_dayStart = -1;

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    { g_riskPct=1.00; g_maxOpenRiskPct=6.0; }
   else if(InpProfile==MODERATE) { g_riskPct=0.50; g_maxOpenRiskPct=4.0; }
   else                          { g_riskPct=0.30; g_maxOpenRiskPct=2.5; }
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
   if(s=="") { PrintFormat("Clunoid ORB: '%s' not tradable here — skipping.", want); return(false); }
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==s) return(false);
   SymSlot slot;
   slot.name=s; slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS); slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.day=-1; slot.orReady=false; slot.traded=false; slot.orHigh=0; slot.orLow=0;
   g_sym[g_symN]=slot; g_symN++;
   return(true);
  }

//+------------------------------------------------------------------+
int SlotOf(const string sym) { for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i); return(-1); }

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
double OpenRiskPct()
  {
   double basis=MathMin(AccountInfoDouble(ACCOUNT_BALANCE),AccountInfoDouble(ACCOUNT_EQUITY));
   if(basis<=0.0) return(1e9);
   double total=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i); if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      string sym=PositionGetString(POSITION_SYMBOL); if(SlotOf(sym)<0) continue;
      double sl=PositionGetDouble(POSITION_SL); if(sl<=0.0){ total+=g_riskPct; continue; }
      double open=PositionGetDouble(POSITION_PRICE_OPEN), vol=PositionGetDouble(POSITION_VOLUME);
      int pdir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      double dist=(pdir>0)?(open-sl):(sl-open); if(dist<=0.0) continue;
      total+=(LossPerLot(sym,dist)*vol)/basis*100.0;
     }
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
   double margin=0.0;
   if(OrderCalcMargin(ot,sym,lots,entry,margin)){ double fm=AccountInfoDouble(ACCOUNT_MARGIN_FREE); if(margin>fm*0.9){ note=StringFormat("SKIP %s: needs %.2f margin, %.2f free",sym,margin,fm); return(0.0);} }
   riskPctOut=(lpl*lots)/basis*100.0;
   return(lots);
  }

int OurPositions(const string sym)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)==sym) n++; }
   return(n);
  }
bool StopsValidFor(const string sym, const int dir, const double sl, const double tp)
  {
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(false);
   double pt=SymbolInfoDouble(sym,SYMBOL_POINT), lvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*pt;
   if(lvl<=0.0) lvl=(tk.ask-tk.bid);
   if(dir>0){ if(!(tk.bid-sl>lvl)) return(false); if(tp>0.0&&!(tp-tk.bid>lvl)) return(false); return(true); }
   if(!(sl-tk.ask>lvl)) return(false); if(tp>0.0&&!(tk.ask-tp>lvl)) return(false); return(true);
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
   PrintFormat("Clunoid ORB: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }
void CloseSymbol(const string sym)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     { ulong tk=PositionGetTicket(i); if(tk==0) continue; if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue; if(PositionGetString(POSITION_SYMBOL)!=sym) continue;
       g_trade.SetTypeFillingBySymbol(sym); if(g_trade.PositionClose(tk)) Succeeded("session close"); }
  }

//+------------------------------------------------------------------+
//| Per-symbol H1 logic: build the opening range, then trade its break|
//+------------------------------------------------------------------+
void ProcessSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   datetime bt = (datetime)SeriesInfoInteger(t.name, TF_ENTRY, SERIES_LASTBAR_DATE);
   if(bt==0 || bt==g_sym[k].lastBar) return;     // act once per new H1 bar
   g_sym[k].lastBar = bt;

   MqlRates r[]; ArraySetAsSeries(r,true);
   if(CopyRates(t.name,TF_ENTRY,0,3,r)!=3) return;
   MqlDateTime dt; TimeToStruct(r[1].time, dt);   // the just-CLOSED H1 bar's server time
   int hour = dt.hour;

   // new day → reset state
   if(dt.day_of_year != g_sym[k].day)
     { g_sym[k].day=dt.day_of_year; g_sym[k].orReady=false; g_sym[k].traded=false; g_sym[k].orHigh=0; g_sym[k].orLow=0; }

   // force flat at/after session end
   if(hour >= InpSessionEndHour) { if(OurPositions(t.name)>0) CloseSymbol(t.name); return; }

   // opening range = the H1 bar(s) starting at the session open
   if(hour >= InpSessionStartHour && hour < InpSessionStartHour+OR_HOURS)
     {
      g_sym[k].orHigh = (g_sym[k].orHigh==0)? r[1].high : MathMax(g_sym[k].orHigh, r[1].high);
      g_sym[k].orLow  = (g_sym[k].orLow==0) ? r[1].low  : MathMin(g_sym[k].orLow,  r[1].low);
      return;
     }
   if(hour < InpSessionStartHour) return;         // before the open — nothing yet
   if(g_sym[k].orHigh<=0 || g_sym[k].orLow<=0) return;
   g_sym[k].orReady = true;

   if(g_sym[k].traded) return;                    // one trade per day
   if(OurPositions(t.name)>0) return;
   if(!TradingAllowed() || DailyLossHit() || !SpreadOK(t.name)) return;

   double close = r[1].close;
   double range = g_sym[k].orHigh - g_sym[k].orLow;
   if(range<=0.0) return;

   int dir = 0;
   if(close > g_sym[k].orHigh) dir = 1;
   else if(close < g_sym[k].orLow) dir = -1;
   if(dir==0) return;

   MqlTick tk; if(!SymbolInfoTick(t.name,tk)) return;
   double entry = (dir>0)?tk.ask:tk.bid;
   double sl = NormalizeDouble(dir>0 ? g_sym[k].orLow : g_sym[k].orHigh, t.digits);
   double tp = NormalizeDouble(dir>0 ? entry + InpTargetR*range : entry - InpTargetR*range, t.digits);

   double riskPct=0.0; string note="";
   double lots = LotsFor(t.name, dir, entry, sl, riskPct, note);
   if(note!="") Print("Clunoid ORB: ", note);
   if(lots<=0.0) { g_sym[k].traded=true; return; }
   if(OpenRiskPct()+riskPct > g_maxOpenRiskPct) return;
   if(!StopsValidFor(t.name,dir,sl,tp)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent=(dir>0)?g_trade.Buy(lots,t.name,0.0,sl,tp,"Clunoid ORB")
                    :g_trade.Sell(lots,t.name,0.0,sl,tp,"Clunoid ORB");
   if(sent && Succeeded("entry"))
     {
      g_sym[k].traded = true;
      PrintFormat("Clunoid ORB: %s %.4f %s @ %.*f | SL %.*f | TP %.*f (%.1fR) | opening-range break",
                  dir>0?"BUY":"SELL", lots, t.name, t.digits, entry, t.digits, sl, t.digits, tp, InpTargetR);
     }
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
   if(g_symN==0){ Print("Clunoid ORB: none of the index basket resolved on this broker."); return(INIT_FAILED); }
   if(InpSessionStartHour<0 || InpSessionStartHour>23 || InpSessionEndHour<=InpSessionStartHour)
     { Print("Clunoid ORB: check InpSessionStartHour / InpSessionEndHour (server time)."); return(INIT_FAILED); }

   RollDay();
   EventSetTimer(20);
   PrintFormat("Clunoid ORB ready — %s profile, %d indices, session %02d:00-%02d:00 server time. Opening-range breakout.",
               ProfileStr(), g_symN, InpSessionStartHour, InpSessionEndHour);
   return(INIT_SUCCEEDED);
  }
void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
void OnTick()  { RollDay(); for(int k=0;k<g_symN;k++) ProcessSymbol(k); }
//+------------------------------------------------------------------+
