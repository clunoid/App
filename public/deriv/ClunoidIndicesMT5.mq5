//+------------------------------------------------------------------+
//|                                           ClunoidIndicesMT5.mq5   |
//|   Clunoid Trading — STOCK INDEX AI automation                     |
//|                                                                   |
//|   SELF-CONTAINED. No internet permissions, no Clunoid account:    |
//|   every decision is made on YOUR terminal from YOUR broker's own  |
//|   prices. One chart runs every index you enable.                  |
//|                                                                   |
//|   WHY SWISS 20 AND WALL STREET 30                                 |
//|   All eleven indices with usable history were put through the     |
//|   identical strategy and the identical 72-configuration grid, and |
//|   every candidate was scored on BOTH halves of the year. What     |
//|   separates these two is not the headline number but how WIDE     |
//|   their winning region is:                                        |
//|                                                                   |
//|     Swiss 20        27 of 34 configurations robust                |
//|     Wall Street 30  31 of 42 robust                               |
//|     UK 100          11 of 58                                      |
//|     Australia 200    4 of 48      Germany 40   4 of 48            |
//|     US 500           1 of 46      Euro 50      1 of 32            |
//|     Netherlands 25, US Tech 100, Japan 225, France 40:  0         |
//|                                                                   |
//|   A result that survives almost anywhere in the parameter space   |
//|   is a property of the market. A result that survives at one      |
//|   setting is usually a property of the search. Traded together,   |
//|   41 of 48 shared settings held up in both halves.                |
//|                                                                   |
//|   WHAT WE DID NOT SHIP, AND WHY                                   |
//|   We also tested all 13 Volatility indices and all 15 Crash/Boom  |
//|   and Jump indices. Every one of them measures as a generated     |
//|   random walk: no volatility clustering, no fat tails, momentum   |
//|   autocorrelation of zero, and independent of each other. Across  |
//|   936 index-by-configuration combinations only 28% were even      |
//|   profitable, where a coin flip gives 50% before costs. There is  |
//|   no edge there to automate, so we did not build that bot.        |
//|                                                                   |
//|   SETUP: drag onto ANY chart, allow algo trading, done.           |
//+------------------------------------------------------------------+
#property copyright "Clunoid"
#property link      "https://www.clunoid.com"
#property version   "1.00"

#include <Trade/Trade.mqh>

enum RiskProfile { CONSERVATIVE=0, MODERATE=1, AGGRESSIVE=2 };

input group           "=== Risk ==="
input RiskProfile InpProfile         = AGGRESSIVE; // Risk profile (Aggressive = 1% per trade, 5% total)
input double      InpRiskPctOverride = 0;          // Override risk % per trade (0 = use profile)
input double      InpMaxDailyLossPct = 5.0;        // Halt new entries after this daily loss (% of day-start equity)

input group           "=== Markets ==="
input string      InpSymbols         = "Swiss 20,Wall Street 30"; // Indices to trade (comma separated; names may contain spaces)
input double      InpMaxSpreadPct    = 0.08;       // Skip entries when spread exceeds this % of price

input group           "=== Session (GMT) ==="
input int         InpSessionStartGMT = 7;          // Start hour, GMT (Europe opens)
input int         InpSessionEndGMT   = 16;         // End hour, GMT (inclusive; covers the US open)

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input bool        InpEnablePartials  = true;       // Bank half at 1R and move to break-even
input bool        InpEnableTrailing  = true;       // Trail the stop once beyond 1R
input bool        InpEnablePyramid   = true;       // Add to winners (hedging accounts only)
input bool        InpCloseOnFlip     = true;       // Close a WINNING trade when the trend flips
input long        InpMagic           = 77091111;   // Magic number (this EA's trades only)

//--- strategy constants — these ARE the validated configuration -------------
#define EMA_FAST      20
#define EMA_SLOW      50
#define EMA_BIAS_F    50
#define EMA_BIAS_S    200
#define ADX_PERIOD    14
#define ATR_PERIOD    14
#define ADX_GATE      18.0
#define MIN_CONF      55.0
#define MIN_RR        2.0
#define MAX_R         5.0
#define MAX_STOP_ATR  2.5
#define MIN_STOP_ATR  1.0
#define SL_BUFFER_ATR 0.5
#define TRAIL_ATR     3.5
#define PARTIAL_AT_R  1.0
#define PULLBACK_LOOK 10
#define PULLBACK_ATR  0.6
#define ENTRY_COOLDOWN 8
#define SWING_K       2
#define RATES_N       400
#define MAX_SYMBOLS   8

#define TF_ENTRY      PERIOD_H1
#define TF_BIAS       PERIOD_H4

double  g_riskPct, g_maxOpenRiskPct;
int     g_maxAdds;

struct SymSlot
  {
   string          name;
   int             digits;
   double          point;
   int             hEmaF, hEmaS, hAdx, hAtr;
   int             hBiasF, hBiasS, hBiasAdx;
   datetime        lastBar;
   datetime        lastEntry;
   bool            firstRead;
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
   double conf, price, sl, tp, risk;
   string why;
  };

//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)    { g_riskPct=1.00; g_maxOpenRiskPct=5.0; g_maxAdds=2; }
   else if(InpProfile==MODERATE) { g_riskPct=0.60; g_maxOpenRiskPct=3.0; g_maxAdds=1; }
   else                          { g_riskPct=0.35; g_maxOpenRiskPct=1.5; g_maxAdds=0; }
   if(InpRiskPctOverride>0.0)
     {
      g_riskPct = InpRiskPctOverride;
      g_maxOpenRiskPct = MathMax(g_maxOpenRiskPct, g_riskPct);
     }
  }

string ProfileStr()
  {
   if(InpProfile==AGGRESSIVE) return("Aggressive");
   if(InpProfile==MODERATE)   return("Moderate");
   return("Conservative");
  }

/** Session in GMT, never server time — brokers run all sorts of offsets. */
bool InSession()
  {
   MqlDateTime g;
   TimeToStruct(TimeGMT(),g);
   int h = g.hour;
   if(InpSessionStartGMT <= InpSessionEndGMT)
      return(h >= InpSessionStartGMT && h <= InpSessionEndGMT);
   return(h >= InpSessionStartGMT || h <= InpSessionEndGMT);
  }

//+------------------------------------------------------------------+
//| Symbol resolution.                                                |
//| NOTE: index names legitimately contain SPACES ("Swiss 20", "Wall  |
//| Street 30"), unlike the FX and crypto bots where a space is the   |
//| signature of a synthetic look-alike. So spaces are allowed here   |
//| and the comma-separated list is trimmed per entry, never stripped |
//| of interior spaces.                                               |
//+------------------------------------------------------------------+
/**
 * Stock indices settle in their HOME currency — Swiss 20 pays in CHF, Germany 40
 * in EUR, Japan 225 in JPY, UK 100 in GBP. Insisting that the profit currency
 * matches the account currency would reject nearly every index on the board, so
 * that test is deliberately absent here. The terminal does the conversion, and
 * sizing is cross-checked against OrderCalcProfit, which the docs guarantee
 * returns a figure in the account's own currency.
 */
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
         if(StringFind(su,wu)<0) continue;            // index names vary by broker
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
     { PrintFormat("Clunoid Indices: '%s' is not tradable on this account — skipping it.", want); return(false); }

   SymSlot slot;
   slot.name=s;
   slot.digits=(int)SymbolInfoInteger(s,SYMBOL_DIGITS);
   slot.point=SymbolInfoDouble(s,SYMBOL_POINT);
   slot.lastBar=0; slot.lastEntry=0; slot.firstRead=false;
   slot.hEmaF    = iMA (s, TF_ENTRY, EMA_FAST,   0, MODE_EMA, PRICE_CLOSE);
   slot.hEmaS    = iMA (s, TF_ENTRY, EMA_SLOW,   0, MODE_EMA, PRICE_CLOSE);
   slot.hAdx     = iADX(s, TF_ENTRY, ADX_PERIOD);
   slot.hAtr     = iATR(s, TF_ENTRY, ATR_PERIOD);
   slot.hBiasF   = iMA (s, TF_BIAS,  EMA_BIAS_F, 0, MODE_EMA, PRICE_CLOSE);
   slot.hBiasS   = iMA (s, TF_BIAS,  EMA_BIAS_S, 0, MODE_EMA, PRICE_CLOSE);
   slot.hBiasAdx = iADX(s, TF_BIAS,  ADX_PERIOD);
   if(slot.hEmaF==INVALID_HANDLE || slot.hEmaS==INVALID_HANDLE || slot.hAdx==INVALID_HANDLE ||
      slot.hAtr==INVALID_HANDLE  || slot.hBiasF==INVALID_HANDLE|| slot.hBiasS==INVALID_HANDLE||
      slot.hBiasAdx==INVALID_HANDLE)
     { PrintFormat("Clunoid Indices: could not build indicators for %s (err %d)", s, GetLastError()); return(false); }

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

int LastSwingLow(const MqlRates &r[], const int from)
  {
   int n = ArraySize(r);
   for(int i=MathMax(from,1+SWING_K); i<n-SWING_K; i++)
     {
      bool ok=true;
      for(int j=i-SWING_K; j<=i+SWING_K && ok; j++)
        { if(j==i) continue; if(r[j].low <= r[i].low) ok=false; }
      if(ok) return(i);
     }
   return(-1);
  }

int LastSwingHigh(const MqlRates &r[], const int from)
  {
   int n = ArraySize(r);
   for(int i=MathMax(from,1+SWING_K); i<n-SWING_K; i++)
     {
      bool ok=true;
      for(int j=i-SWING_K; j<=i+SWING_K && ok; j++)
        { if(j==i) continue; if(r[j].high >= r[i].high) ok=false; }
      if(ok) return(i);
     }
   return(-1);
  }

//+------------------------------------------------------------------+
Setup Analyse(const int k)
  {
   Setup s;
   s.valid=false; s.dir=0; s.conf=0.0; s.price=0.0; s.sl=0.0; s.tp=0.0; s.risk=0.0; s.why="";
   SymSlot t = g_sym[k];

   double emaF[], emaS[], adx[], atr[], bF[], bS[], bAdx[];
   int need = PULLBACK_LOOK + SWING_K + 5;
   if(!Buf(t.hEmaF,0,need,emaF) || !Buf(t.hEmaS,0,need,emaS) ||
      !Buf(t.hAdx,MAIN_LINE,3,adx) || !Buf(t.hAtr,0,3,atr) ||
      !Buf(t.hBiasF,0,3,bF) || !Buf(t.hBiasS,0,3,bS) || !Buf(t.hBiasAdx,MAIN_LINE,3,bAdx))
     { s.why="history not ready"; return(s); }

   MqlRates r[];
   if(!Rates(t.name, TF_ENTRY, RATES_N, r)) { s.why="rates not ready"; return(s); }

   int biasDir  = (bF[1] > bS[1]) ? 1 : (bF[1] < bS[1]) ? -1 : 0;
   int entryDir = (emaF[1] > emaS[1]) ? 1 : (emaF[1] < emaS[1]) ? -1 : 0;
   if(biasDir==0 || biasDir!=entryDir) { s.why="H4 and H1 disagree"; return(s); }
   int dir = biasDir;

   double a = atr[1];
   if(a<=0.0) { s.why="no ATR"; return(s); }

   double conf = 35.0;
   if(bAdx[1] >= ADX_GATE) conf += 20.0;
   if(adx[1]  >= ADX_GATE) conf += 15.0;

   int h1i = LastSwingHigh(r,1);
   int h2i = (h1i>0) ? LastSwingHigh(r,h1i+1) : -1;
   int l1i = LastSwingLow(r,1);
   int l2i = (l1i>0) ? LastSwingLow(r,l1i+1) : -1;
   if(h1i>0 && h2i>0 && l1i>0 && l2i>0)
     {
      bool hh = r[h1i].high > r[h2i].high, hl = r[l1i].low > r[l2i].low;
      bool lh = r[h1i].high < r[h2i].high, ll = r[l1i].low < r[l2i].low;
      if(dir>0 && hh && hl) conf += 20.0;
      if(dir<0 && lh && ll) conf += 20.0;
     }
   double close = r[1].close;
   if(MathAbs(close - emaS[1]) / a <= 1.5) conf += 10.0;

   bool retraced=false;
   for(int j=2; j<=PULLBACK_LOOK+1 && j<ArraySize(r); j++)
     {
      double d = (dir>0) ? (r[j].low - emaS[j]) / a : (emaS[j] - r[j].high) / a;
      if(d <= PULLBACK_ATR) { retraced=true; break; }
     }
   double body = close - r[1].open;
   bool resumed = (dir>0)
                  ? (close > emaF[1] && body > 0 && close > r[2].high)
                  : (close < emaF[1] && body < 0 && close < r[2].low);
   s.dir=dir; s.conf=conf;
   if(!retraced) { s.why="no pullback yet"; return(s); }
   if(!resumed)  { s.why="waiting for resumption"; return(s); }
   if(conf < MIN_CONF) { s.why=StringFormat("confidence %.0f < %.0f", conf, MIN_CONF); return(s); }

   MqlTick tk;
   if(!SymbolInfoTick(t.name,tk)) { s.why="no tick"; return(s); }
   double entry = (dir>0) ? tk.ask : tk.bid;
   double buf = SL_BUFFER_ATR * a;
   double sl, tp;

   if(dir>0)
     {
      if(l1i<0) { s.why="no swing low"; return(s); }
      sl = r[l1i].low - buf;
      if(sl >= entry)                 { s.why="stop above price"; return(s); }
      if(entry - sl > MAX_STOP_ATR*a) { s.why="too extended — structure too far"; return(s); }
      if(entry - sl < MIN_STOP_ATR*a) sl = entry - MIN_STOP_ATR*a;
      double risk = entry - sl, need2 = entry + MIN_RR*risk;
      double best=0.0; int idx=1;
      for(int n=0;n<12;n++)
        {
         int hi = LastSwingHigh(r,idx); if(hi<0) break;
         double hv = r[hi].high;
         if(hv >= need2 && (best==0.0 || hv < best)) best = hv;
         idx = hi+1;
        }
      tp = (best>0.0) ? MathMin(best, entry + MAX_R*risk) : need2;
      s.risk = risk;
     }
   else
     {
      if(h1i<0) { s.why="no swing high"; return(s); }
      sl = r[h1i].high + buf;
      if(sl <= entry)                 { s.why="stop below price"; return(s); }
      if(sl - entry > MAX_STOP_ATR*a) { s.why="too extended — structure too far"; return(s); }
      if(sl - entry < MIN_STOP_ATR*a) sl = entry + MIN_STOP_ATR*a;
      double risk = sl - entry, need2 = entry - MIN_RR*risk;
      double best=0.0; int idx=1;
      for(int n=0;n<12;n++)
        {
         int lo = LastSwingLow(r,idx); if(lo<0) break;
         double lv = r[lo].low;
         if(lv <= need2 && (best==0.0 || lv > best)) best = lv;
         idx = lo+1;
        }
      tp = (best>0.0) ? MathMax(best, entry - MAX_R*risk) : need2;
      s.risk = risk;
     }

   s.price = entry;
   s.sl = NormalizeDouble(sl,t.digits);
   s.tp = NormalizeDouble(tp,t.digits);
   s.valid = true;
   s.why = "ready";
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

int SlotOf(const string sym)
  {
   for(int i=0;i<g_symN;i++) if(g_sym[i].name==sym) return(i);
   return(-1);
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

double LotsFor(const string sym, const int dir, const double entry, const double sl,
               double &riskPctOut, string &note)
  {
   riskPctOut=0.0; note="";
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
      double riskAtMin = lpl * vmin;
      double pctAtMin  = riskAtMin / basis * 100.0;
      if(pctAtMin <= g_maxOpenRiskPct)
        {
         lots = vmin;
         note = StringFormat("%s: min lot %.2f risks %.2f%% (above the %.2f%% target but inside the %.1f%% cap)",
                             sym, vmin, pctAtMin, g_riskPct, g_maxOpenRiskPct);
        }
      else
        {
         note = StringFormat("SKIP %s: smallest lot %.2f risks %.2f %s = %.1f%% of %.2f — over the %.1f%% cap.",
                             sym, vmin, riskAtMin, AccountInfoString(ACCOUNT_CURRENCY), pctAtMin, basis, g_maxOpenRiskPct);
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

/** Indices move together in a risk-off shock, so open risk is summed at full
    weight across them against one account-wide ceiling. */
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

bool FrozenForClose(const string sym, const int dir, const double sl, const double tp)
  {
   double pt = SymbolInfoDouble(sym,SYMBOL_POINT);
   double fz = (double)SymbolInfoInteger(sym,SYMBOL_TRADE_FREEZE_LEVEL) * pt;
   if(fz<=0.0) return(false);
   MqlTick tk; if(!SymbolInfoTick(sym,tk)) return(true);
   double ref = (dir>0) ? tk.bid : tk.ask;
   if(sl>0.0 && MathAbs(ref-sl) < fz) return(true);
   if(tp>0.0 && MathAbs(ref-tp) < fz) return(true);
   return(false);
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
   PrintFormat("Clunoid Indices: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }

//+------------------------------------------------------------------+
void TryEnter(const int k, const Setup &s)
  {
   if(!s.valid || !TradingAllowed()) return;
   if(!InSession()) return;
   SymSlot t = g_sym[k];
   if(DailyLossHit()) return;
   if(!SpreadOK(t.name)) return;

   if(t.lastEntry>0 && (TimeCurrent()-t.lastEntry) < PeriodSeconds(TF_ENTRY)*ENTRY_COOLDOWN) return;
   if(OurPositions(t.name,-s.dir)>0) return;

   int sameDir = OurPositions(t.name,s.dir);
   if(sameDir>0)
     {
      if(!InpEnablePyramid) return;
      if(!g_hedging) return;
      if(sameDir-1 >= g_maxAdds) return;
      if(!AllInProfit(t.name,s.dir)) return;
     }

   double riskPct=0.0; string note="";
   double lots = LotsFor(t.name, s.dir, s.price, s.sl, riskPct, note);
   if(note!="") Print("Clunoid Indices: ", note);
   if(lots<=0.0) return;

   if(OpenRiskPct() + riskPct > g_maxOpenRiskPct)
     {
      PrintFormat("Clunoid Indices: skipping %s — open risk %.2f%% + %.2f%% would pass the %.1f%% account cap (indices are counted together because they fall together).",
                  t.name, OpenRiskPct(), riskPct, g_maxOpenRiskPct);
      return;
     }
   if(!StopsValidFor(t.name,s.dir,s.sl,s.tp)) return;

   g_trade.SetTypeFillingBySymbol(t.name);
   bool sent = (s.dir>0)
               ? g_trade.Buy (lots,t.name,0.0,s.sl,s.tp,"Clunoid Indices")
               : g_trade.Sell(lots,t.name,0.0,s.sl,s.tp,"Clunoid Indices");
   if(!sent || !Succeeded("entry")) return;

   g_sym[k].lastEntry = TimeCurrent();
   double rr = (s.risk>0.0) ? MathAbs(s.tp-s.price)/s.risk : 0.0;
   PrintFormat("Clunoid Indices: %s %.2f %s @ %.*f | SL %.*f | TP %.*f | %.1fR | confidence %.0f%s",
               s.dir>0?"BUY":"SELL", lots, t.name, t.digits, s.price, t.digits, s.sl, t.digits, s.tp,
               rr, s.conf, sameDir>0?" (add)":"");
  }

//+------------------------------------------------------------------+
void ManageSymbol(const int k)
  {
   SymSlot t = g_sym[k];
   MqlTick tk; if(!SymbolInfoTick(t.name,tk)) return;
   double atrb[];
   double atr = Buf(t.hAtr,0,3,atrb) ? atrb[1] : 0.0;

   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=t.name) continue;

      int    dir  = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp   = PositionGetDouble(POSITION_TP);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      double now  = (dir>0)?tk.bid:tk.ask;

      bool   atBE     = (sl>0.0) && ((dir>0 && sl>=open) || (dir<0 && sl<=open));
      bool   inProfit = (dir>0) ? (now>open) : (now<open);
      double riskDist = (sl>0.0 && !atBE) ? MathAbs(open-sl) : 0.0;
      double R = (riskDist>0.0) ? ((dir>0)?(now-open)/riskDist:(open-now)/riskDist) : 0.0;
      bool   past1R = atBE || (riskDist>0.0 && R >= 1.0);
      if(atr<=0.0 && riskDist>0.0) atr = riskDist;
      if(atr<=0.0) continue;

      if(InpEnablePartials && !atBE && riskDist>0.0 && R >= PARTIAL_AT_R)
        {
         double half = NormalizeVolume(t.name, vol*0.5);
         double vmin = SymbolInfoDouble(t.name,SYMBOL_VOLUME_MIN);
         double tol  = 1e-8;
         if(half>=vmin-tol && (vol-half)>=vmin-tol && !FrozenForClose(t.name,dir,sl,tp))
           {
            g_trade.SetTypeFillingBySymbol(t.name);
            if(g_trade.PositionClosePartial(ticket,half) && Succeeded("partial close"))
               PrintFormat("Clunoid Indices: %s — banked %.2f at 1R, letting the rest run.", t.name, half);
           }
         double be = NormalizeDouble(open,t.digits);
         if(!Frozen(t.name,dir,be) && StopsValidFor(t.name,dir,be,tp))
            if(g_trade.PositionModify(ticket,be,tp)) Succeeded("break-even");
         continue;
        }

      if(InpEnableTrailing && past1R)
        {
         double trail = NormalizeDouble((dir>0) ? now - TRAIL_ATR*atr : now + TRAIL_ATR*atr, t.digits);
         double minStep = 0.10*atr;
         bool better = (dir>0) ? (sl<=0.0 || trail > sl+minStep) : (sl<=0.0 || trail < sl-minStep);
         if(better && !Frozen(t.name,dir,trail) && StopsValidFor(t.name,dir,trail,tp))
            if(g_trade.PositionModify(ticket,trail,tp)) Succeeded("trail");
        }

      if(InpCloseOnFlip && inProfit)
        {
         double f[],s2[];
         if(Buf(t.hEmaF,0,3,f) && Buf(t.hEmaS,0,3,s2))
           {
            bool flipped = (dir>0) ? (f[1]<s2[1]) : (f[1]>s2[1]);
            if(flipped && !FrozenForClose(t.name,dir,sl,tp))
              {
               g_trade.SetTypeFillingBySymbol(t.name);
               if(g_trade.PositionClose(ticket) && Succeeded("flip exit"))
                  PrintFormat("Clunoid Indices: %s — trend flipped while green, took the profit.", t.name);
              }
           }
        }
     }
  }

//+------------------------------------------------------------------+
void StartupReport()
  {
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   string cur = AccountInfoString(ACCOUNT_CURRENCY);
   PrintFormat("Clunoid Indices EA v1.0 — %d index(es) | profile %s (%.2f%% per trade, %.1f%% total across ALL indices) | balance %.2f %s | %s account",
               g_symN, ProfileStr(), g_riskPct, g_maxOpenRiskPct, bal, cur, g_hedging?"hedging":"netting");
   PrintFormat("Clunoid Indices: trading window %02d:00-%02d:59 GMT — it is %02d:%02d GMT now, so the window is %s.",
               InpSessionStartGMT, InpSessionEndGMT,
               (int)((TimeGMT()/3600)%24), (int)((TimeGMT()/60)%60), InSession()?"OPEN":"closed");
   if(!g_hedging && InpEnablePyramid)
      Print("Clunoid Indices: NETTING account — adding to winners is disabled, because extra orders merge into one position instead of stacking.");

   for(int i=0;i<g_symN;i++)
     {
      SymSlot t = g_sym[i];
      MqlTick tk; SymbolInfoTick(t.name,tk);
      double vmin = SymbolInfoDouble(t.name,SYMBOL_VOLUME_MIN);
      double cs   = SymbolInfoDouble(t.name,SYMBOL_TRADE_CONTRACT_SIZE);
      double atrb[];
      double atr = Buf(t.hAtr,0,3,atrb) ? atrb[1] : 0.0;
      double lpl = (atr>0.0) ? LossPerLot(t.name, 1.6*atr) : 0.0;
      PrintFormat("Clunoid Indices:   %s bid %.*f | contract %.2f | min lot %.2f | spread %.4f%%",
                  t.name, t.digits, tk.bid, cs, vmin,
                  tk.bid>0.0 ? ((tk.ask-tk.bid)/tk.bid)*100.0 : 0.0);
      if(lpl>0.0 && bal>0.0)
        {
         double riskAtMin = lpl*vmin, pct = riskAtMin/bal*100.0;
         PrintFormat("Clunoid Indices:     a typical stop costs %.2f %s at the minimum lot = %.2f%% of your balance.",
                     riskAtMin, cur, pct);
         if(pct > g_maxOpenRiskPct)
            PrintFormat("Clunoid Indices:     WARNING — that exceeds your %.1f%% cap, so %s setups will mostly be SKIPPED. You would need about %.0f %s.",
                        g_maxOpenRiskPct, t.name, riskAtMin*100.0/g_riskPct, cur);
        }
     }
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   ApplyProfile();
   g_hedging = (AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);
   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);

   if(InpSessionStartGMT<0 || InpSessionStartGMT>23 || InpSessionEndGMT<0 || InpSessionEndGMT>23)
     { Print("Clunoid Indices: session hours must be 0-23 (GMT)."); return(INIT_FAILED); }

   g_symN = 0;
   string parts[];
   int n = StringSplit(InpSymbols,',',parts);
   for(int i=0;i<n;i++)
     {
      string one = parts[i];
      StringTrimLeft(one); StringTrimRight(one);   // trim per entry; interior spaces are part of the name
      if(one!="") AddSymbol(one);
     }
   if(g_symN==0)
     {
      Print("Clunoid Indices: none of the requested indices are tradable here. Check the Indices input, or open Market Watch and show your broker's index symbols.");
      return(INIT_FAILED);
     }

   RollDay();
   StartupReport();

   Print("Clunoid Indices: analysing every index now...");
   for(int i=0;i<g_symN;i++)
     {
      Setup s = Analyse(i);
      PrintFormat("Clunoid Indices:   %-16s %-5s conf %3.0f  %s",
                  g_sym[i].name, s.dir>0?"LONG":s.dir<0?"SHORT":"flat", s.conf, s.why);
      if(s.valid) TryEnter(i,s);
     }

   EventSetTimer(15);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   for(int i=0;i<g_symN;i++)
     {
      IndicatorRelease(g_sym[i].hEmaF);   IndicatorRelease(g_sym[i].hEmaS);
      IndicatorRelease(g_sym[i].hAdx);    IndicatorRelease(g_sym[i].hAtr);
      IndicatorRelease(g_sym[i].hBiasF);  IndicatorRelease(g_sym[i].hBiasS);
      IndicatorRelease(g_sym[i].hBiasAdx);
     }
  }

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
            PrintFormat("Clunoid Indices:   %-16s %-5s conf %3.0f  %s",
                        g_sym[i].name, f.dir>0?"LONG":f.dir<0?"SHORT":"flat", f.conf, f.why);
           }
        }

      datetime bar = (datetime)SeriesInfoInteger(g_sym[i].name,TF_ENTRY,SERIES_LASTBAR_DATE);
      if(bar==0 || bar==g_sym[i].lastBar) continue;
      g_sym[i].lastBar = bar;

      ManageSymbol(i);
      if(!TradingAllowed()) continue;
      Setup s = Analyse(i);
      if(s.valid) TryEnter(i,s);
     }
  }

void OnTick() { }
//+------------------------------------------------------------------+
