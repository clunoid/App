//+------------------------------------------------------------------+
//|                                                  ClunoidMT5.mq5   |
//|   Clunoid Trading — Deriv MT5 automation (Model A, custody-free)  |
//|                                                                   |
//|   The AI/strategy runs in Clunoid's cloud. This EA polls the      |
//|   signal feed and executes on YOUR terminal, on YOUR account —    |
//|   Clunoid never sees a password. Put it on a VPS (Deriv/MT5       |
//|   Virtual Hosting) to trade 24/7 with your PC off.                |
//|                                                                   |
//|   It opens trades, sets stop-loss & take-profit, TRAILS the stop, |
//|   banks PARTIAL profits, and PYRAMIDS into strong trends — all    |
//|   from the cloud signal, sized to your balance.                   |
//|                                                                   |
//|   One-time setup: Tools > Options > Expert Advisors >             |
//|     tick "Allow WebRequest for listed URL" and add:               |
//|         https://www.clunoid.com                                   |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "2.00"
#property strict

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input RiskProfile InpProfile        = MODERATE;   // Risk profile (match your choice on clunoid.com)
input string      InpCategory       = "forex";    // Market category
input int         InpPollSeconds    = 30;         // How often to poll for signals
input long        InpMagic          = 77090001;   // Magic number (Clunoid trades only)
input int         InpMaxSpreadPts   = 40;         // Skip if spread exceeds this (points)
input string      InpSymbolSuffix   = "";         // Broker symbol suffix, e.g. ".r" (blank if none)
input double      InpMaxDailyLossPct= 5;          // Daily-loss cap % of day-start equity (halts new entries)
input int         InpReentryCooldownMin = 15;     // Min minutes before re-entering the same symbol
input int         InpMinStopPoints  = 10;         // Reject signals whose stop is closer than this (points)
input bool        InpEnableTrailing = true;       // Trail the stop as price advances
input bool        InpEnablePartials = true;       // Bank partial profits at the ladder
input bool        InpEnablePyramid  = true;       // Add to winners (needs a hedging account)
input bool        InpTradingEnabled = true;       // Master on/off switch

// One parsed signal line from the feed.
struct Sig
  {
   string sym, side;
   double entry, sl, tp, risk, trail;
   int    nP; double pPrice[8]; double pPct[8];
   int    nA; double aPrice[8]; double aPct[8];
  };

string  g_base = "https://www.clunoid.com/api/deriv/mt5/signals";
CTrade  g_trade;
double  g_dayStartEquity = 0.0;
int     g_dayStart = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(20);
   g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
   g_dayStart = DayOfYearNow();
   EventSetTimer(MathMax(5, InpPollSeconds));
   PrintFormat("Clunoid MT5 EA v2 started — profile=%s. Ensure https://www.clunoid.com is whitelisted in WebRequest.", ProfileStr());
   Poll();
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer() { Poll(); }

//+------------------------------------------------------------------+
string ProfileStr()
  {
   if(InpProfile==CONSERVATIVE) return "conservative";
   if(InpProfile==AGGRESSIVE)   return "aggressive";
   return "moderate";
  }
int DayOfYearNow() { MqlDateTime t; TimeToStruct(TimeCurrent(), t); return t.day_of_year; }

double GVget(string k, double def) { return GlobalVariableCheck(k) ? GlobalVariableGet(k) : def; }
void   GVset(string k, double v)   { GlobalVariableSet(k, v); }

//+------------------------------------------------------------------+
//| Main loop: manage open positions, then open new signals          |
//+------------------------------------------------------------------+
void Poll()
  {
   if(!InpTradingEnabled) return;

   if(DayOfYearNow()!=g_dayStart) { g_dayStart=DayOfYearNow(); g_dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY); }

   bool dailyHalt=false;
   if(InpMaxDailyLossPct>0 && g_dayStartEquity>0)
     {
      double dd=(AccountInfoDouble(ACCOUNT_EQUITY)-g_dayStartEquity)/g_dayStartEquity*100.0;
      if(dd <= -InpMaxDailyLossPct) dailyHalt=true;   // no NEW entries; still manage open trades
     }

   string url = StringFormat("%s?profile=%s&category=%s&format=csv", g_base, ProfileStr(), InpCategory);
   string body = HttpGet(url);

   Sig sigs[]; int nSigs=0;
   if(body!="")
     {
      string lines[]; int n=StringSplit(body, '\n', lines);
      ArrayResize(sigs, n);
      for(int i=0;i<n;i++)
        {
         string ln=lines[i]; StringTrimLeft(ln); StringTrimRight(ln);
         if(StringLen(ln)==0 || StringGetCharacter(ln,0)=='#') continue;
         if(ParseLine(ln, sigs[nSigs])) nSigs++;
        }
      ArrayResize(sigs, nSigs);
     }

   // 1) manage every open Clunoid position (trail + partials) — always, even on halt
   ManagePositions();
   // 2) pyramid into live signals (hedging accounts only)
   if(!dailyHalt) DoPyramiding(sigs, nSigs);
   // 3) open fresh base entries
   if(!dailyHalt) for(int i=0;i<nSigs;i++) OpenBase(sigs[i]);
   // 4) clear stored plans for closed positions
   CleanupPlans();

   Comment(StringFormat("Clunoid MT5 v2 · %s · %d signals · %s%s",
           ProfileStr(), nSigs, TimeToString(TimeCurrent(), TIME_SECONDS), dailyHalt?" · DAILY LOSS HALT":""));
  }

//+------------------------------------------------------------------+
//| Parse one CSV line into a Sig                                    |
//+------------------------------------------------------------------+
bool ParseLine(string line, Sig &s)
  {
   string f[];
   if(StringSplit(line, ',', f) < 8) return false;
   s.sym=f[0]; s.side=f[1];
   s.entry=StringToDouble(f[2]); s.sl=StringToDouble(f[3]); s.tp=StringToDouble(f[4]);
   s.risk=StringToDouble(f[5]);
   s.trail = (ArraySize(f)>8) ? StringToDouble(f[8]) : 0;
   s.nP=0; s.nA=0;
   if(ArraySize(f)>9  && f[9]!="-"  && f[9]!="")  ParsePairs(f[9],  s.pPrice, s.pPct, s.nP);
   if(ArraySize(f)>10 && f[10]!="-" && f[10]!="") ParsePairs(f[10], s.aPrice, s.aPct, s.nA);
   return true;
  }

void ParsePairs(string field, double &price[], double &val[], int &cnt)
  {
   cnt=0;
   string pairs[]; int n=StringSplit(field, ';', pairs);
   for(int i=0;i<n && cnt<8;i++)
     {
      string kv[];
      if(StringSplit(pairs[i], ':', kv) >= 2) { price[cnt]=StringToDouble(kv[0]); val[cnt]=StringToDouble(kv[1]); cnt++; }
     }
  }

//+------------------------------------------------------------------+
//| Open the base position for a fresh signal                        |
//+------------------------------------------------------------------+
void OpenBase(Sig &s)
  {
   string sym = s.sym + InpSymbolSuffix;
   if(!SymbolSelect(sym, true)) return;
   if(HasOpenPosition(sym)) return;
   if(OnCooldown(sym)) return;

   double ask=SymbolInfoDouble(sym,SYMBOL_ASK), bid=SymbolInfoDouble(sym,SYMBOL_BID);
   if(ask<=0 || bid<=0) return;
   double point=SymbolInfoDouble(sym,SYMBOL_POINT);
   if(point>0 && (ask-bid)/point > InpMaxSpreadPts) return;

   bool buy=(s.side=="buy");
   double price = buy ? ask : bid;
   if(buy  && !(s.sl<price && s.tp>price)) return;
   if(!buy && !(s.sl>price && s.tp<price)) return;

   double stopsLvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*point;
   double minDist=MathMax(InpMinStopPoints*point, stopsLvl);
   if(MathAbs(price-s.sl) < minDist) return;

   double lots=LotsForRisk(sym, price, s.sl, s.risk);
   if(lots<=0) return;

   g_trade.SetTypeFillingBySymbol(sym);
   bool ok = buy ? g_trade.Buy(lots, sym, price, s.sl, s.tp, "clunoid")
                 : g_trade.Sell(lots, sym, price, s.sl, s.tp, "clunoid");
   if(ok)
     {
      StampEntry(sym);
      GVset("cl_add_"+sym, 0);                 // reset pyramid counter for this symbol
      ulong tk=FindUnplannedPosition(sym);
      if(tk>0) StorePlan(tk, s, lots);
      PrintFormat("Clunoid %s %s %.2f lots @ %s SL %s TP %s", s.side, sym, lots,
                  DoubleToString(price,_Digits), DoubleToString(s.sl,_Digits), DoubleToString(s.tp,_Digits));
     }
   else PrintFormat("Clunoid order failed %s %s: %d", s.side, sym, g_trade.ResultRetcode());
  }

//+------------------------------------------------------------------+
//| Pyramiding — add to a live winner at the next add level          |
//| Requires a hedging account (each add is its own managed position)|
//+------------------------------------------------------------------+
void DoPyramiding(Sig &sigs[], int n)
  {
   if(!InpEnablePyramid) return;
   if((ENUM_ACCOUNT_MARGIN_MODE)AccountInfoInteger(ACCOUNT_MARGIN_MODE) != ACCOUNT_MARGIN_MODE_RETAIL_HEDGING) return;

   for(int k=0;k<n;k++)
     {
      if(sigs[k].nA==0) continue;
      string sym = sigs[k].sym + InpSymbolSuffix;
      if(!SymbolSelect(sym,true) || !HasOpenPosition(sym)) continue;
      bool buy=(sigs[k].side=="buy");
      if((BasePositionSide(sym)>0) != buy) continue;  // signal must match the open direction

      int done=(int)GVget("cl_add_"+sym, 0);
      if(done >= sigs[k].nA) continue;

      double ap=sigs[k].aPrice[done];
      double ask=SymbolInfoDouble(sym,SYMBOL_ASK), bid=SymbolInfoDouble(sym,SYMBOL_BID);
      bool hit = buy ? (bid <= ap) : (ask >= ap);      // pulled back to the add level
      if(!hit) continue;

      double price = buy ? ask : bid;
      double point=SymbolInfoDouble(sym,SYMBOL_POINT);
      if(point>0 && (ask-bid)/point > InpMaxSpreadPts) continue;
      if(buy  && !(sigs[k].sl<price && sigs[k].tp>price)) continue;
      if(!buy && !(sigs[k].sl>price && sigs[k].tp<price)) continue;
      double stopsLvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*point;
      if(MathAbs(price-sigs[k].sl) < MathMax(InpMinStopPoints*point, stopsLvl)) continue;

      double lots=LotsForRisk(sym, price, sigs[k].sl, sigs[k].aPct[done]);
      if(lots<=0) continue;

      g_trade.SetTypeFillingBySymbol(sym);
      bool ok = buy ? g_trade.Buy(lots, sym, price, sigs[k].sl, sigs[k].tp, "clunoid-add")
                    : g_trade.Sell(lots, sym, price, sigs[k].sl, sigs[k].tp, "clunoid-add");
      if(ok)
        {
         GVset("cl_add_"+sym, done+1);
         ulong tk=FindUnplannedPosition(sym);
         if(tk>0) StorePlan(tk, sigs[k], lots);
         PrintFormat("Clunoid ADD #%d %s %s %.2f lots", done+1, sigs[k].side, sym, lots);
        }
     }
  }

//+------------------------------------------------------------------+
//| Manage every open Clunoid position: trailing stop + partials     |
//+------------------------------------------------------------------+
void ManagePositions()
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(InpEnablePartials) FirePartials(tk);
      if(InpEnableTrailing) TrailStop(tk);
     }
  }

void TrailStop(ulong tk)
  {
   if(!PositionSelectByTicket(tk)) return;
   double trail=GVget("cl_trail_"+(string)tk, 0);
   if(trail<=0) return;
   string sym=PositionGetString(POSITION_SYMBOL);
   long type=PositionGetInteger(POSITION_TYPE);
   double curSL=PositionGetDouble(POSITION_SL);
   double tp=PositionGetDouble(POSITION_TP);
   int digits=(int)SymbolInfoInteger(sym,SYMBOL_DIGITS);
   double point=SymbolInfoDouble(sym,SYMBOL_POINT);
   double stopsLvl=(double)SymbolInfoInteger(sym,SYMBOL_TRADE_STOPS_LEVEL)*point;
   double bid=SymbolInfoDouble(sym,SYMBOL_BID), ask=SymbolInfoDouble(sym,SYMBOL_ASK);

   if(type==POSITION_TYPE_BUY)
     {
      double newSL=NormalizeDouble(bid-trail, digits);
      if(newSL > curSL+point && (bid-newSL) >= stopsLvl && newSL < bid)
         g_trade.PositionModify(tk, newSL, tp);
     }
   else
     {
      double newSL=NormalizeDouble(ask+trail, digits);
      if((curSL==0 || newSL < curSL-point) && (newSL-ask) >= stopsLvl && newSL > ask)
         g_trade.PositionModify(tk, newSL, tp);
     }
  }

void FirePartials(ulong tk)
  {
   if(!PositionSelectByTicket(tk)) return;
   string sym=PositionGetString(POSITION_SYMBOL);
   int np=(int)GVget("cl_np_"+(string)tk, 0);
   int pf=(int)GVget("cl_pf_"+(string)tk, 0);
   if(pf>=np) return;
   double ov=GVget("cl_ov_"+(string)tk, 0);
   long type=PositionGetInteger(POSITION_TYPE);
   double bid=SymbolInfoDouble(sym,SYMBOL_BID), ask=SymbolInfoDouble(sym,SYMBOL_ASK);
   double vstep=SymbolInfoDouble(sym,SYMBOL_VOLUME_STEP);
   double vmin=SymbolInfoDouble(sym,SYMBOL_VOLUME_MIN);

   for(int i=pf;i<np;i++)
     {
      double pp=GVget("cl_pp_"+(string)tk+"_"+(string)i, 0);
      double pc=GVget("cl_pc_"+(string)tk+"_"+(string)i, 0);
      bool hit = (type==POSITION_TYPE_BUY) ? (bid>=pp) : (ask<=pp);
      if(!hit) break;                                  // partials are ordered

      double vol = ov*pc/100.0;
      if(vstep>0) vol = MathFloor(vol/vstep)*vstep;
      double posVol = PositionGetDouble(POSITION_VOLUME);
      // keep a runner: only close if it leaves at least the minimum lot open
      if(vol>=vmin && (posVol-vol)>=vmin)
         g_trade.PositionClosePartial(tk, vol);
      GVset("cl_pf_"+(string)tk, i+1);
     }
  }

//+------------------------------------------------------------------+
//| Plan storage (per position ticket) + cleanup                     |
//+------------------------------------------------------------------+
void StorePlan(ulong tk, Sig &s, double ov)
  {
   string T=(string)tk;
   GVset("cl_trail_"+T, s.trail);
   GVset("cl_ov_"+T, ov);
   GVset("cl_np_"+T, s.nP);
   GVset("cl_pf_"+T, 0);
   for(int i=0;i<s.nP;i++) { GVset("cl_pp_"+T+"_"+(string)i, s.pPrice[i]); GVset("cl_pc_"+T+"_"+(string)i, s.pPct[i]); }
  }

void CleanupPlans()
  {
   for(int i=GlobalVariablesTotal()-1;i>=0;i--)
     {
      string name=GlobalVariableName(i);
      if(StringFind(name,"cl_trail_")!=0) continue;
      ulong tk=(ulong)StringToInteger(StringSubstr(name, 9));
      if(tk>0 && !PositionSelectByTicket(tk)) DeleteTicketGVs(tk);
     }
  }

void DeleteTicketGVs(ulong tk)
  {
   string T=(string)tk;
   GlobalVariableDel("cl_trail_"+T);
   GlobalVariableDel("cl_ov_"+T);
   GlobalVariableDel("cl_np_"+T);
   GlobalVariableDel("cl_pf_"+T);
   for(int i=0;i<8;i++) { GlobalVariableDel("cl_pp_"+T+"_"+(string)i); GlobalVariableDel("cl_pc_"+T+"_"+(string)i); }
  }

//+------------------------------------------------------------------+
//| Position helpers                                                 |
//+------------------------------------------------------------------+
bool HasOpenPosition(string sym)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==sym && PositionGetInteger(POSITION_MAGIC)==InpMagic) return true;
     }
   return false;
  }

int BasePositionSide(string sym)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==sym && PositionGetInteger(POSITION_MAGIC)==InpMagic)
         return (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY) ? 1 : -1;
     }
   return 0;
  }

// The most recent Clunoid position on this symbol that has no stored plan yet.
ulong FindUnplannedPosition(string sym)
  {
   ulong best=0; datetime bestT=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk=PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)!=sym || PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(GlobalVariableCheck("cl_trail_"+(string)tk)) continue;
      datetime t=(datetime)PositionGetInteger(POSITION_TIME);
      if(t>=bestT) { bestT=t; best=tk; }
     }
   return best;
  }

//+------------------------------------------------------------------+
//| Re-entry cooldown (prevents SL->re-enter churn)                  |
//+------------------------------------------------------------------+
string GVKey(string sym) { return "clunoid_last_"+sym; }
bool OnCooldown(string sym)
  {
   if(InpReentryCooldownMin<=0) return false;
   string k=GVKey(sym);
   if(!GlobalVariableCheck(k)) return false;
   datetime last=(datetime)GlobalVariableGet(k);
   return (TimeCurrent()-last) < (long)InpReentryCooldownMin*60;
  }
void StampEntry(string sym) { GlobalVariableSet(GVKey(sym), (double)TimeCurrent()); }

//+------------------------------------------------------------------+
//| Risk-based lot sizing off CURRENT balance + this symbol's specs  |
//+------------------------------------------------------------------+
double LotsForRisk(string sym, double price, double sl, double riskPct)
  {
   if(riskPct<=0) return 0;
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * riskPct / 100.0;
   double tickVal   = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tickVal<=0) tickVal = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);
   if(tickVal<=0 || tickSize<=0) return 0;

   double slDist = MathAbs(price - sl);
   double ticks  = slDist / tickSize;
   double lossPerLot = ticks * tickVal;
   if(lossPerLot<=0) return 0;

   double lots = riskMoney / lossPerLot;

   double vmin = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double vmax = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double vstep= SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);
   if(vstep>0) lots = MathFloor(lots/vstep)*vstep;
   if(lots < vmin) return 0;              // sub-minimum → skip, never up-size (that over-risks)
   lots = MathMin(vmax, lots);            // only ever clamp DOWN
   int vdig = (vstep>0) ? (int)MathRound(-MathLog10(vstep)) : 2;
   return NormalizeDouble(lots, vdig);
  }

//+------------------------------------------------------------------+
//| HTTP GET via WebRequest (URL must be whitelisted in the terminal)|
//+------------------------------------------------------------------+
string HttpGet(string url)
  {
   char post[]; char result[]; string headers;
   ResetLastError();
   int code = WebRequest("GET", url, "", 5000, post, result, headers);
   if(code==-1)
     {
      int err=GetLastError();
      if(err==4014 || err==4060) PrintFormat("WebRequest blocked — add https://www.clunoid.com in Tools>Options>Expert Advisors.");
      else PrintFormat("WebRequest error %d", err);
      return "";
     }
   if(code!=200) { PrintFormat("Signal feed HTTP %d", code); return ""; }
   return CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
  }
//+------------------------------------------------------------------+
