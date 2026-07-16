//+------------------------------------------------------------------+
//|                                                  ClunoidMT5.mq5   |
//|   Clunoid Trading — Deriv MT5 automation (Model A, custody-free)  |
//|                                                                   |
//|   The AI/strategy runs in Clunoid's cloud. This EA polls the      |
//|   signal feed and executes on YOUR terminal, on YOUR account —    |
//|   Clunoid never sees a password. Put it on a VPS (Deriv/MT5       |
//|   Virtual Hosting) to trade 24/7 with your PC off.                |
//|                                                                   |
//|   One-time setup: Tools > Options > Expert Advisors >             |
//|     tick "Allow WebRequest for listed URL" and add:               |
//|         https://www.clunoid.com                                   |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"
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
input bool        InpTradingEnabled = true;       // Master on/off switch

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
   PrintFormat("Clunoid MT5 EA started — profile=%s. Ensure https://www.clunoid.com is whitelisted in WebRequest.", ProfileStr());
   Poll(); // first pull immediately
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

int DayOfYearNow()
  {
   MqlDateTime t; TimeToStruct(TimeCurrent(), t); return t.day_of_year;
  }

//+------------------------------------------------------------------+
//| Poll the signal feed and act on it                               |
//+------------------------------------------------------------------+
void Poll()
  {
   if(!InpTradingEnabled) return;

   // reset the day window
   if(DayOfYearNow()!=g_dayStart) { g_dayStart=DayOfYearNow(); g_dayStartEquity=AccountInfoDouble(ACCOUNT_EQUITY); }

   // local daily-loss guard (optional, on top of the cloud's)
   if(InpMaxDailyLossPct>0 && g_dayStartEquity>0)
     {
      double dd = (AccountInfoDouble(ACCOUNT_EQUITY)-g_dayStartEquity)/g_dayStartEquity*100.0;
      if(dd <= -InpMaxDailyLossPct) { Comment("Clunoid: daily loss cap hit — standing aside."); return; }
     }

   string url = StringFormat("%s?profile=%s&category=%s&format=csv", g_base, ProfileStr(), InpCategory);
   string body = HttpGet(url);
   if(body=="") { Comment("Clunoid: no signal feed (check WebRequest whitelist)."); return; }

   string lines[];
   int n = StringSplit(body, '\n', lines);
   int acted = 0;
   for(int i=0;i<n;i++)
     {
      string ln = lines[i];
      StringTrimLeft(ln); StringTrimRight(ln);
      if(StringLen(ln)==0 || StringGetCharacter(ln,0)=='#') continue;
      if(HandleSignal(ln)) acted++;
     }
   Comment(StringFormat("Clunoid MT5 · %s · %d signals · %s", ProfileStr(), n>0?n-1:0, TimeToString(TimeCurrent(), TIME_SECONDS)));
  }

//+------------------------------------------------------------------+
//| Parse one CSV line: SYMBOL,SIDE,ENTRY,SL,TP,RISKPCT,CONF,DIGITS  |
//+------------------------------------------------------------------+
bool HandleSignal(string line)
  {
   string f[];
   if(StringSplit(line, ',', f) < 7) return false;
   string sym    = f[0] + InpSymbolSuffix;
   string side   = f[1];
   double sl     = StringToDouble(f[3]);
   double tp     = StringToDouble(f[4]);
   double riskPct= StringToDouble(f[5]);

   if(!SymbolSelect(sym, true)) return false;                 // not offered by this broker
   if(HasOpenPosition(sym)) return false;                     // one Clunoid position per symbol (v1)

   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   if(ask<=0 || bid<=0) return false;

   double point = SymbolInfoDouble(sym, SYMBOL_POINT);
   double spread = (point>0) ? (ask-bid)/point : 0;
   if(spread > InpMaxSpreadPts) return false;                 // too costly right now

   bool buy = (side=="buy");
   double price = buy ? ask : bid;

   // sanity: stop/target must sit on the correct side of price
   if(buy  && !(sl<price && tp>price)) return false;
   if(!buy && !(sl>price && tp<price)) return false;

   // minimum stop distance — a near-price stop would blow up the lot size or be
   // rejected by the broker's stops level.
   double stopsLvl = (double)SymbolInfoInteger(sym, SYMBOL_TRADE_STOPS_LEVEL) * point;
   double minDist  = MathMax(InpMinStopPoints*point, stopsLvl);
   if(MathAbs(price - sl) < minDist) return false;

   if(OnCooldown(sym)) return false;                          // no immediate re-entry churn

   double lots = LotsForRisk(sym, price, sl, riskPct);
   if(lots<=0) return false;

   g_trade.SetTypeFillingBySymbol(sym);
   bool ok = buy ? g_trade.Buy(lots, sym, price, sl, tp, "clunoid")
                 : g_trade.Sell(lots, sym, price, sl, tp, "clunoid");
   if(ok) { StampEntry(sym); PrintFormat("Clunoid %s %s %.2f lots @ %.5f SL %.5f TP %.5f", side, sym, lots, price, sl, tp); }
   else   PrintFormat("Clunoid order failed %s %s: %d", side, sym, g_trade.ResultRetcode());
   return ok;
  }

//+------------------------------------------------------------------+
//| Risk-based lot sizing off CURRENT balance + this symbol's specs  |
//+------------------------------------------------------------------+
double LotsForRisk(string sym, double price, double sl, double riskPct)
  {
   if(riskPct<=0) return 0;
   double balance   = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskMoney = balance * riskPct / 100.0;
   // LOSS-side tick value (differs from the profit side on cross-currency pairs);
   // fall back to the generic tick value if the broker doesn't populate it.
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
//| Per-symbol re-entry cooldown (prevents SL->re-enter churn)       |
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
bool HasOpenPosition(string sym)
  {
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetString(POSITION_SYMBOL)==sym && PositionGetInteger(POSITION_MAGIC)==InpMagic)
         return true;
     }
   return false;
  }

//+------------------------------------------------------------------+
//| HTTP GET via WebRequest (URL must be whitelisted in the terminal)|
//+------------------------------------------------------------------+
string HttpGet(string url)
  {
   char   post[]; char result[]; string headers;
   ResetLastError();
   int timeout = 5000;
   int code = WebRequest("GET", url, "", timeout, post, result, headers);
   if(code==-1)
     {
      int err = GetLastError();
      if(err==4014 || err==4060) PrintFormat("WebRequest blocked — add https://www.clunoid.com in Tools>Options>Expert Advisors.");
      else PrintFormat("WebRequest error %d", err);
      return "";
     }
   if(code!=200) { PrintFormat("Signal feed HTTP %d", code); return ""; }
   return CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
  }
//+------------------------------------------------------------------+
