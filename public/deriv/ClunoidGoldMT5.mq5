//+------------------------------------------------------------------+
//|                                              ClunoidGoldMT5.mq5   |
//|   Clunoid Trading — GOLD (XAU/USD) AI automation                  |
//|                                                                   |
//|   SELF-CONTAINED. Unlike the general Clunoid EA this one needs no |
//|   internet, no WebRequest whitelist and no Clunoid account: every  |
//|   decision is made on YOUR terminal from YOUR broker's own gold    |
//|   prices, so the levels it trades are the levels you actually see. |
//|                                                                   |
//|   HOW IT THINKS                                                   |
//|     1. Bias first. The higher timeframe (H4) decides direction     |
//|        via EMA50 vs EMA200 — trend is your friend, we never fade   |
//|        it.                                                         |
//|     2. Then the entry timeframe (H1) must agree (EMA20 vs EMA50).  |
//|        Disagreement = no trade, which is how it uses high and low  |
//|        timeframes together without confusing itself.               |
//|     3. Confidence is scored 0-100 from trend alignment, ADX on     |
//|        both timeframes, market structure (HH/HL or LH/LL) and how  |
//|        close price is to value. Below MinConfidence it stands down.|
//|     4. It only enters on a PULLBACK-AND-RESUME, never mid-move.    |
//|     5. Stop goes beyond the last real swing (+ATR buffer); target  |
//|        is the next structural level at 2R or better.               |
//|                                                                    |
//|   HOW IT MANAGES RISK                                              |
//|     Risk per trade and total open risk are hard caps sized off     |
//|     your balance — 1% / 5% on Aggressive, less on the calmer       |
//|     profiles. Banks a partial at 1R, moves to break-even, then     |
//|     trails. Adds to winners only while they are in profit and the  |
//|     total risk cap still allows it. If the trend flips while the   |
//|     trade is green it takes the money and leaves.                  |
//|                                                                    |
//|   SETUP: drag onto any XAUUSD chart, allow algo trading, done.     |
//|   The timeframe of the chart does not matter — it reads the        |
//|   timeframes it needs itself.                                      |
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

input group           "=== Market ==="
input string      InpSymbolOverride  = "";         // Gold symbol (blank = auto-detect XAUUSD)
input int         InpMaxSpreadPts    = 60;         // Skip entries when spread exceeds this (points)

input group           "=== Timeframes ==="
input bool        InpUseH1           = true;       // H1 entries / H4 bias  <- the tested configuration
input bool        InpUseH4           = false;      // H4 entries / D1 bias  (opt-in, not validated)
input bool        InpUseM15          = false;      // M15 entries / H1 bias (opt-in, tested POORLY on gold)

input group           "=== Behaviour ==="
input bool        InpTradingEnabled  = true;       // Master on/off switch
input bool        InpEnablePartials  = true;       // Bank half at 1R and move to break-even
input bool        InpEnableTrailing  = true;       // Trail the stop once beyond 1R
input bool        InpEnablePyramid   = true;       // Add to winners (hedging accounts only)
input bool        InpCloseOnFlip     = true;       // Close a WINNING trade when the trend flips
input long        InpMagic           = 77090777;   // Magic number (this EA's trades only)

//--- strategy constants (mirror the validated backtest exactly) -------------
#define EMA_FAST      20     // entry timeframe fast EMA
#define EMA_SLOW      50     // entry timeframe slow EMA
#define EMA_BIAS_F    50     // bias timeframe fast EMA
#define EMA_BIAS_S    200    // bias timeframe slow EMA
#define ADX_PERIOD    14
#define ATR_PERIOD    14
#define ADX_GATE      18.0   // ADX level that earns confidence points
#define MIN_CONF      55.0   // below this the EA stands down
#define MIN_RR        2.0    // never take a target closer than 2R
#define MAX_R         5.0    // never chase an unreachable target
#define MAX_STOP_ATR  2.5    // reject setups whose structure sits further than this
#define MIN_STOP_ATR  1.0    // keep the stop outside normal noise
#define SL_BUFFER_ATR 0.5    // padding beyond the swing
#define TRAIL_ATR     2.5    // trailing distance once in profit
#define PARTIAL_AT_R  1.0    // bank a partial here
#define PULLBACK_LOOK 10     // bars to look back for the retrace
#define PULLBACK_ATR  0.6    // "near value" threshold, in ATR
#define ENTRY_COOLDOWN 8     // bars between entries, so one setup = one trade
#define SWING_K       2      // fractal half-width
#define RATES_N       400    // bars of history we analyse

//--- per-profile risk (differs by RISK TAKEN, not by how strictly we analyse)
double  g_riskPct, g_maxOpenRiskPct;
int     g_maxAdds;

//--- one candidate timeframe pair -------------------------------------------
struct TFSlot
  {
   bool            on;
   string          name;
   ENUM_TIMEFRAMES entry, bias;
   int             hEmaF, hEmaS, hAdx, hAtr;   // entry timeframe
   int             hBiasF, hBiasS, hBiasAdx;   // bias timeframe
  };
TFSlot  g_tf[3];
int     g_tfN = 0;

CTrade  g_trade;
string  g_sym = "";
double  g_point = 0.0;
int     g_digits = 0;
bool    g_hedging = false;
double  g_dayStartEquity = 0.0;
int     g_dayStart = -1;
datetime g_lastBarSeen[3];
datetime g_lastEntryTime = 0;
ENUM_TIMEFRAMES g_lastEntryTF = PERIOD_H1;

//--- one analysed setup ------------------------------------------------------
struct Setup
  {
   bool            valid;
   int             dir;        // +1 long, -1 short
   double          conf;       // 0..100
   double          price, sl, tp, risk;
   ENUM_TIMEFRAMES tf;
   string          why;
  };

//+------------------------------------------------------------------+
//| Profile -> risk numbers                                          |
//+------------------------------------------------------------------+
void ApplyProfile()
  {
   if(InpProfile==AGGRESSIVE)      { g_riskPct=1.00; g_maxOpenRiskPct=5.0; g_maxAdds=2; }
   else if(InpProfile==MODERATE)   { g_riskPct=0.60; g_maxOpenRiskPct=3.0; g_maxAdds=1; }
   else                            { g_riskPct=0.35; g_maxOpenRiskPct=1.5; g_maxAdds=0; }
   if(InpRiskPctOverride>0.0)
     {
      g_riskPct = InpRiskPctOverride;
      // keep the portfolio cap sane relative to a hand-set per-trade risk
      g_maxOpenRiskPct = MathMax(g_maxOpenRiskPct, g_riskPct);
     }
  }

string ProfileStr()
  {
   if(InpProfile==AGGRESSIVE) return("Aggressive");
   if(InpProfile==MODERATE)   return("Moderate");
   return("Conservative");
  }

//+------------------------------------------------------------------+
//| Find the broker's gold symbol. Never blindly trust the chart      |
//| symbol — it must pass the same tradability checks as any other.   |
//+------------------------------------------------------------------+
bool SymbolTradable(const string s)
  {
   if(!SymbolSelect(s,true)) return(false);
   long mode = SymbolInfoInteger(s,SYMBOL_TRADE_MODE);
   if(mode==SYMBOL_TRADE_MODE_DISABLED || mode==SYMBOL_TRADE_MODE_CLOSEONLY) return(false);
   return(true);
  }

string ResolveGold()
  {
   if(InpSymbolOverride!="")
      return(SymbolTradable(InpSymbolOverride) ? InpSymbolOverride : "");

   // the chart symbol wins only if it really is gold AND is tradable
   string cur = _Symbol;
   string up = cur; StringToUpper(up);
   if((StringFind(up,"XAU")>=0 || StringFind(up,"GOLD")>=0) && SymbolTradable(cur))
      return(cur);

   // otherwise search Market Watch first, then the whole symbol tree
   string best = "";
   for(int pass=0; pass<2; pass++)
     {
      int total = SymbolsTotal(pass==0);
      for(int i=0;i<total;i++)
        {
         string s = SymbolName(i,pass==0);
         string su = s; StringToUpper(su);
         if(StringFind(su,"XAU")<0 && StringFind(su,"GOLD")<0) continue;
         if(StringFind(su,"XAUEUR")>=0 || StringFind(su,"XAUGBP")>=0 || StringFind(su,"XAUAUD")>=0) continue;
         if(StringFind(su,"USD")<0 && StringFind(su,"GOLD")<0) continue;
         if(!SymbolTradable(s)) continue;
         // prefer the plainest name (fewest suffix characters)
         if(best=="" || StringLen(s)<StringLen(best)) best = s;
        }
      if(best!="") return(best);
     }
   return("");
  }

//+------------------------------------------------------------------+
//| Indicator plumbing                                               |
//+------------------------------------------------------------------+
bool AddSlot(const bool on, const string name, const ENUM_TIMEFRAMES entry, const ENUM_TIMEFRAMES bias)
  {
   if(!on) return(true);
   TFSlot s;
   s.on=true; s.name=name; s.entry=entry; s.bias=bias;
   s.hEmaF    = iMA (g_sym, entry, EMA_FAST,   0, MODE_EMA, PRICE_CLOSE);
   s.hEmaS    = iMA (g_sym, entry, EMA_SLOW,   0, MODE_EMA, PRICE_CLOSE);
   s.hAdx     = iADX(g_sym, entry, ADX_PERIOD);
   s.hAtr     = iATR(g_sym, entry, ATR_PERIOD);
   s.hBiasF   = iMA (g_sym, bias,  EMA_BIAS_F, 0, MODE_EMA, PRICE_CLOSE);
   s.hBiasS   = iMA (g_sym, bias,  EMA_BIAS_S, 0, MODE_EMA, PRICE_CLOSE);
   s.hBiasAdx = iADX(g_sym, bias,  ADX_PERIOD);
   if(s.hEmaF==INVALID_HANDLE || s.hEmaS==INVALID_HANDLE || s.hAdx==INVALID_HANDLE ||
      s.hAtr==INVALID_HANDLE  || s.hBiasF==INVALID_HANDLE|| s.hBiasS==INVALID_HANDLE||
      s.hBiasAdx==INVALID_HANDLE)
     {
      PrintFormat("Clunoid Gold: could not create indicators for %s (err %d)", name, GetLastError());
      return(false);
     }
   g_tf[g_tfN] = s;
   g_lastBarSeen[g_tfN] = 0;
   g_tfN++;
   return(true);
  }

/** Read `count` values of an indicator buffer, newest first. */
bool Buf(const int handle, const int index, const int count, double &out[])
  {
   ArraySetAsSeries(out,true);
   if(BarsCalculated(handle) < count) return(false);
   return(CopyBuffer(handle,index,0,count,out) == count);
  }

bool Rates(const ENUM_TIMEFRAMES tf, const int count, MqlRates &out[])
  {
   ArraySetAsSeries(out,true);
   return(CopyRates(g_sym,tf,0,count,out) == count);
  }

//+------------------------------------------------------------------+
//| Swing detection (fractals). Series order: index 0 = newest, so a  |
//| swing at i needs SWING_K CLOSED bars on the newer side too, hence |
//| the search starts at 1+SWING_K.                                   |
//+------------------------------------------------------------------+
int LastSwingLow(const MqlRates &r[], const int from)
  {
   int n = ArraySize(r);
   for(int i=MathMax(from,1+SWING_K); i<n-SWING_K; i++)
     {
      bool isLow = true;
      for(int j=i-SWING_K; j<=i+SWING_K && isLow; j++)
        { if(j==i) continue; if(r[j].low <= r[i].low) isLow=false; }
      if(isLow) return(i);
     }
   return(-1);
  }

int LastSwingHigh(const MqlRates &r[], const int from)
  {
   int n = ArraySize(r);
   for(int i=MathMax(from,1+SWING_K); i<n-SWING_K; i++)
     {
      bool isHigh = true;
      for(int j=i-SWING_K; j<=i+SWING_K && isHigh; j++)
        { if(j==i) continue; if(r[j].high >= r[i].high) isHigh=false; }
      if(isHigh) return(i);
     }
   return(-1);
  }

//+------------------------------------------------------------------+
//| ANALYSE one timeframe pair on its last CLOSED bar.               |
//| Returns direction + confidence, or valid=false to stand down.    |
//+------------------------------------------------------------------+
Setup Analyse(const int slot)
  {
   Setup s;
   s.valid=false; s.dir=0; s.conf=0.0; s.price=0.0; s.sl=0.0; s.tp=0.0; s.risk=0.0;
   s.tf=g_tf[slot].entry; s.why="";
   TFSlot t = g_tf[slot];

   double emaF[], emaS[], adx[], atr[], bF[], bS[], bAdx[];
   int need = PULLBACK_LOOK + SWING_K + 5;
   if(!Buf(t.hEmaF,0,need,emaF) || !Buf(t.hEmaS,0,need,emaS) ||
      !Buf(t.hAdx,MAIN_LINE,3,adx) || !Buf(t.hAtr,0,3,atr) ||
      !Buf(t.hBiasF,0,3,bF) || !Buf(t.hBiasS,0,3,bS) || !Buf(t.hBiasAdx,MAIN_LINE,3,bAdx))
     { s.why="history not ready"; return(s); }

   MqlRates r[];
   if(!Rates(t.entry, RATES_N, r)) { s.why="rates not ready"; return(s); }

   // ---- 1. higher timeframe decides direction -----------------------------
   int biasDir = (bF[1] > bS[1]) ? 1 : (bF[1] < bS[1]) ? -1 : 0;
   // ---- 2. entry timeframe must agree -------------------------------------
   int entryDir = (emaF[1] > emaS[1]) ? 1 : (emaF[1] < emaS[1]) ? -1 : 0;
   if(biasDir==0 || biasDir!=entryDir)
     { s.why="timeframes disagree"; return(s); }
   int dir = biasDir;

   // ---- 3. confidence -----------------------------------------------------
   double a = atr[1];
   if(a<=0.0) { s.why="no ATR"; return(s); }
   double conf = 35.0;                                    // aligned trend (required)
   if(bAdx[1] >= ADX_GATE) conf += 20.0;                  // bias timeframe has strength
   if(adx[1]  >= ADX_GATE) conf += 15.0;                  // entry timeframe has strength

   // market structure: two swings each side
   int h1i = LastSwingHigh(r,1);
   int h2i = (h1i>0) ? LastSwingHigh(r,h1i+1) : -1;
   int l1i = LastSwingLow(r,1);
   int l2i = (l1i>0) ? LastSwingLow(r,l1i+1) : -1;
   if(h1i>0 && h2i>0 && l1i>0 && l2i>0)
     {
      bool hh = r[h1i].high > r[h2i].high, hl = r[l1i].low  > r[l2i].low;
      bool lh = r[h1i].high < r[h2i].high, ll = r[l1i].low  < r[l2i].low;
      if(dir>0 && hh && hl) conf += 20.0;
      if(dir<0 && lh && ll) conf += 20.0;
     }
   double close = r[1].close;
   if(MathAbs(close - emaS[1]) / a <= 1.5) conf += 10.0;   // entering near value

   // ---- 4. trigger: must have pulled back, then resumed -------------------
   bool retraced = false;
   for(int k=2; k<=PULLBACK_LOOK+1 && k<ArraySize(r); k++)
     {
      double d = (dir>0) ? (r[k].low - emaS[k]) / a : (emaS[k] - r[k].high) / a;
      if(d <= PULLBACK_ATR) { retraced = true; break; }
     }
   double body = close - r[1].open;
   bool resumed = (dir>0)
                  ? (close > emaF[1] && body > 0 && close > r[2].high)
                  : (close < emaF[1] && body < 0 && close < r[2].low);
   if(!retraced) { s.why="no pullback yet"; s.conf=conf; s.dir=dir; return(s); }
   if(!resumed)  { s.why="waiting for resumption"; s.conf=conf; s.dir=dir; return(s); }

   s.dir = dir; s.conf = conf;
   if(conf < MIN_CONF) { s.why=StringFormat("confidence %.0f < %.0f", conf, MIN_CONF); return(s); }

   // ---- 5. structural stop + target ---------------------------------------
   MqlTick tk;
   if(!SymbolInfoTick(g_sym,tk)) { s.why="no tick"; return(s); }
   double entry = (dir>0) ? tk.ask : tk.bid;
   double buf   = SL_BUFFER_ATR * a;
   double sl, tp;

   if(dir>0)
     {
      if(l1i<0) { s.why="no swing low"; return(s); }
      sl = r[l1i].low - buf;
      if(sl >= entry)                  { s.why="stop above price"; return(s); }
      if(entry - sl > MAX_STOP_ATR*a)  { s.why="too extended — structure too far"; return(s); }
      if(entry - sl < MIN_STOP_ATR*a)  sl = entry - MIN_STOP_ATR*a;
      double risk = entry - sl;
      double need2 = entry + MIN_RR*risk;
      // NEAREST structural high at or beyond the minimum reward, capped
      double best = 0.0;
      int idx = 1;
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
      if(sl <= entry)                  { s.why="stop below price"; return(s); }
      if(sl - entry > MAX_STOP_ATR*a)  { s.why="too extended — structure too far"; return(s); }
      if(sl - entry < MIN_STOP_ATR*a)  sl = entry + MIN_STOP_ATR*a;
      double risk = sl - entry;
      double need2 = entry - MIN_RR*risk;
      double best = 0.0;
      int idx = 1;
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
   s.sl = NormalizeDouble(sl,g_digits);
   s.tp = NormalizeDouble(tp,g_digits);
   s.valid = true;
   s.why = "ready";
   return(s);
  }

//+------------------------------------------------------------------+
//| Pick the timeframe with the clearest direction (highest           |
//| confidence). This is what runs the moment the EA is attached.     |
//+------------------------------------------------------------------+
Setup BestSetup(const bool verbose)
  {
   Setup best;
   best.valid=false; best.dir=0; best.conf=-1.0; best.price=0.0; best.sl=0.0; best.tp=0.0;
   best.risk=0.0; best.tf=PERIOD_H1; best.why="no timeframe ready";
   for(int i=0;i<g_tfN;i++)
     {
      Setup s = Analyse(i);
      if(verbose)
         PrintFormat("Clunoid Gold: %-9s dir=%-5s conf=%3.0f  %s",
                     g_tf[i].name,
                     s.dir>0 ? "LONG" : s.dir<0 ? "SHORT" : "flat",
                     s.conf, s.why);
      if(s.valid && s.conf > best.conf) best = s;
     }
   return(best);
  }

//+------------------------------------------------------------------+
//| Volume normalisation. Rounds DOWN onto the broker's volume grid   |
//| WITHOUT deriving decimals from the step (0.25-style steps break   |
//| that trick and get rejected as invalid volume).                   |
//+------------------------------------------------------------------+
double NormalizeVolume(double lots)
  {
   double vmin  = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN);
   double vmax  = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MAX);
   double vstep = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_STEP);
   if(vstep<=0.0) vstep = (vmin>0.0 ? vmin : 0.01);
   double steps = MathFloor(NormalizeDouble(lots/vstep,8));
   lots = NormalizeDouble(steps*vstep,8);
   if(vmax>0.0 && lots>vmax)
      lots = NormalizeDouble(MathFloor(NormalizeDouble(vmax/vstep,8))*vstep,8);
   if(lots < vmin) return(0.0);       // caller MUST skip — sub-minimum cannot be traded
   return(lots);
  }

/** Money lost per lot if this stop is hit, in account currency. */
double LossPerLot(const double stopDist)
  {
   double ts = SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_SIZE);
   double tv = SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE_LOSS);
   if(tv<=0.0) tv = SymbolInfoDouble(g_sym,SYMBOL_TRADE_TICK_VALUE);
   if(ts<=0.0 || tv<=0.0 || stopDist<=0.0) return(0.0);
   return((stopDist/ts) * tv);
  }

//+------------------------------------------------------------------+
//| Size a trade to a risk budget.                                    |
//| On gold the smallest tradeable position already risks real money, |
//| so a small account often cannot express 1%. We take the broker    |
//| minimum ONLY while its true risk stays inside the portfolio cap;  |
//| otherwise we skip and say why. We never round UP into more risk.  |
//+------------------------------------------------------------------+
double LotsFor(const int dir, const double entry, const double sl, double &riskPctOut, string &note)
  {
   riskPctOut = 0.0; note = "";
   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double basis   = MathMin(balance,equity);           // never size off unrealised gains
   if(basis<=0.0) { note="no balance"; return(0.0); }

   double stopDist = MathAbs(entry-sl);
   double lpl = LossPerLot(stopDist);
   if(lpl<=0.0) { note="cannot value the stop"; return(0.0); }

   // cross-check the tick maths against the terminal's own P&L engine
   double ref=0.0;
   ENUM_ORDER_TYPE ot = (dir>0) ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   if(OrderCalcProfit(ot,g_sym,1.0,entry,sl,ref) && ref<0.0)
      lpl = MathMax(lpl, MathAbs(ref));                // take the more conservative figure

   double budget = basis * g_riskPct / 100.0;
   double raw    = budget / lpl;
   double lots   = NormalizeVolume(raw);

   double vmin = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN);
   if(lots<=0.0)
     {
      double riskAtMin = lpl * vmin;
      double pctAtMin  = riskAtMin / basis * 100.0;
      if(pctAtMin <= g_maxOpenRiskPct)
        {
         lots = vmin;
         note = StringFormat("min lot %.2f risks %.2f%% (above the %.2f%% target — allowed, still inside the %.1f%% cap)",
                             vmin, pctAtMin, g_riskPct, g_maxOpenRiskPct);
        }
      else
        {
         note = StringFormat("SKIP: smallest lot %.2f risks %.2f %s = %.1f%% of %.2f — over the %.1f%% cap. Gold needs about %.0f %s for this profile.",
                             vmin, riskAtMin, AccountInfoString(ACCOUNT_CURRENCY), pctAtMin, basis,
                             g_maxOpenRiskPct, riskAtMin*100.0/g_riskPct, AccountInfoString(ACCOUNT_CURRENCY));
         return(0.0);
        }
     }

   // respect the per-direction exposure cap
   double vlimit = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_LIMIT);
   if(vlimit>0.0)
     {
      double already = DirectionalVolume(dir);
      double room = vlimit - already;
      if(room <= 0.0) { note="symbol volume limit reached"; return(0.0); }
      if(lots > room) { lots = NormalizeVolume(room); if(lots<=0.0) { note="volume limit leaves no room"; return(0.0); } }
     }

   // margin must actually be available
   double margin=0.0;
   if(OrderCalcMargin(ot,g_sym,lots,entry,margin))
     {
      double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
      if(margin > freeMargin*0.9)
        {
         note = StringFormat("SKIP: needs %.2f margin, only %.2f free", margin, freeMargin);
         return(0.0);
        }
     }

   riskPctOut = (lpl * lots) / basis * 100.0;
   return(lots);
  }

//+------------------------------------------------------------------+
//| Position bookkeeping — always filtered by OUR magic and symbol    |
//+------------------------------------------------------------------+
double DirectionalVolume(const int dir)
  {
   double v=0.0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=g_sym) continue;
      long ptype = PositionGetInteger(POSITION_TYPE);
      int  pdir  = (ptype==POSITION_TYPE_BUY) ? 1 : -1;
      if(pdir==dir) v += PositionGetDouble(POSITION_VOLUME);
     }
   return(v);
  }

int OurPositions(const int dir)
  {
   int n=0;
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=g_sym) continue;
      if(dir==0) { n++; continue; }
      long ptype = PositionGetInteger(POSITION_TYPE);
      int  pdir  = (ptype==POSITION_TYPE_BUY) ? 1 : -1;
      if(pdir==dir) n++;
     }
   return(n);
  }

/** Live total open risk as a % of balance. A position at break-even risks nothing. */
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
      if(PositionGetString(POSITION_SYMBOL)!=g_sym) continue;
      double sl = PositionGetDouble(POSITION_SL);
      if(sl<=0.0)
        {
         // no stop on the books yet — treat it as the full per-trade budget rather
         // than infinity, which would otherwise freeze the EA permanently
         total += g_riskPct;
         continue;
        }
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double vol  = PositionGetDouble(POSITION_VOLUME);
      long ptype  = PositionGetInteger(POSITION_TYPE);
      double dist = (ptype==POSITION_TYPE_BUY) ? (open-sl) : (sl-open);
      if(dist<=0.0) continue;                        // at or beyond break-even = no risk
      total += (LossPerLot(dist)*vol)/basis*100.0;
     }
   return(total);
  }

//+------------------------------------------------------------------+
//| Broker level checks                                              |
//+------------------------------------------------------------------+
double StopsLevelPrice()
  {
   long lvl = SymbolInfoInteger(g_sym,SYMBOL_TRADE_STOPS_LEVEL);
   return((double)lvl * g_point);
  }

double FreezeLevelPrice()
  {
   long lvl = SymbolInfoInteger(g_sym,SYMBOL_TRADE_FREEZE_LEVEL);
   return((double)lvl * g_point);
  }

/** Can we PLACE a stop/target at this level, or is it inside the freeze zone? */
bool Frozen(const int dir, const double level)
  {
   double fz = FreezeLevelPrice();
   if(fz<=0.0) return(false);
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return(true);
   double ref = (dir>0) ? tk.bid : tk.ask;
   return(MathAbs(ref-level) < fz);
  }

/**
 * Can we CLOSE (fully or partially) right now? The freeze level blocks closing a
 * position whose own SL/TP sits too near the market — it is NOT a question about
 * the current price, so this must never be asked as Frozen(dir, currentPrice):
 * that compares the price with itself, is always zero apart, and would silently
 * block every close for any broker that sets a freeze level at all.
 */
bool FrozenForClose(const int dir, const double sl, const double tp)
  {
   double fz = FreezeLevelPrice();
   if(fz<=0.0) return(false);
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return(true);
   double ref = (dir>0) ? tk.bid : tk.ask;
   if(sl>0.0 && MathAbs(ref-sl) < fz) return(true);
   if(tp>0.0 && MathAbs(ref-tp) < fz) return(true);
   return(false);
  }

bool SpreadOK()
  {
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return(false);
   if(g_point<=0.0) return(true);
   double pts = (tk.ask-tk.bid)/g_point;
   return(pts <= (double)InpMaxSpreadPts);
  }

//+------------------------------------------------------------------+
//| Trading permission + daily loss guard                            |
//+------------------------------------------------------------------+
bool TradingAllowed()
  {
   if(!InpTradingEnabled) return(false);
   if(!MQLInfoInteger(MQL_TRADE_ALLOWED))              return(false);
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))    return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_ALLOWED))      return(false);
   if(!AccountInfoInteger(ACCOUNT_TRADE_EXPERT))       return(false);
   long mode = SymbolInfoInteger(g_sym,SYMBOL_TRADE_MODE);
   if(mode==SYMBOL_TRADE_MODE_DISABLED || mode==SYMBOL_TRADE_MODE_CLOSEONLY) return(false);
   return(true);
  }

void RollDay()
  {
   MqlDateTime dt; TimeToStruct(TimeCurrent(),dt);
   int doy = dt.day_of_year;
   if(doy!=g_dayStart)
     {
      g_dayStart = doy;
      g_dayStartEquity = AccountInfoDouble(ACCOUNT_EQUITY);
     }
  }

bool DailyLossHit()
  {
   if(InpMaxDailyLossPct<=0.0 || g_dayStartEquity<=0.0) return(false);
   double eq = AccountInfoDouble(ACCOUNT_EQUITY);
   double dd = (g_dayStartEquity-eq)/g_dayStartEquity*100.0;
   return(dd >= InpMaxDailyLossPct);
  }

//+------------------------------------------------------------------+
//| Report a CTrade outcome honestly — a true return does NOT mean    |
//| the server accepted the trade.                                    |
//+------------------------------------------------------------------+
bool Succeeded(const string what)
  {
   uint rc = g_trade.ResultRetcode();
   if(rc==TRADE_RETCODE_DONE || rc==TRADE_RETCODE_PLACED ||
      rc==TRADE_RETCODE_DONE_PARTIAL)
      return(true);
   if(rc==TRADE_RETCODE_NO_CHANGES) return(true);       // already where we wanted it
   // The session ending is normal, not a fault — the EA simply tries again on the
   // next bar once gold reopens. Logging it as an error would just cry wolf.
   if(rc==TRADE_RETCODE_MARKET_CLOSED) return(false);
   PrintFormat("Clunoid Gold: %s failed — retcode %u (%s)", what, rc, g_trade.ResultRetcodeDescription());
   return(false);
  }

//+------------------------------------------------------------------+
//| ENTRY                                                            |
//+------------------------------------------------------------------+
void TryEnter(const Setup &s)
  {
   if(!s.valid) return;
   if(!TradingAllowed()) return;
   if(DailyLossHit())
     { Print("Clunoid Gold: daily loss cap reached — no new entries today."); return; }
   if(!SpreadOK()) return;

   // one entry per setup, not one per bar
   if(g_lastEntryTime>0)
     {
      int secs = PeriodSeconds(s.tf) * ENTRY_COOLDOWN;
      if(TimeCurrent() - g_lastEntryTime < secs) return;
     }

   int opposite = OurPositions(-s.dir);
   if(opposite>0) return;                        // never hedge ourselves

   int sameDir = OurPositions(s.dir);
   if(sameDir>0)
     {
      // this would be a pyramid add
      if(!InpEnablePyramid) return;
      if(!g_hedging) return;                     // netting would merge, not add
      if(sameDir-1 >= g_maxAdds) return;
      if(!AllInProfit(s.dir)) return;            // only ever add to winners
     }

   double riskPct=0.0; string note="";
   double lots = LotsFor(s.dir, s.price, s.sl, riskPct, note);
   if(lots<=0.0)
     { if(note!="") Print("Clunoid Gold: ", note); return; }
   if(note!="") Print("Clunoid Gold: ", note);

   if(OpenRiskPct() + riskPct > g_maxOpenRiskPct)
     { PrintFormat("Clunoid Gold: skipping — open risk %.2f%% + %.2f%% would exceed the %.1f%% cap.",
                   OpenRiskPct(), riskPct, g_maxOpenRiskPct); return; }

   if(!StopsValidFor(s.dir,s.sl,s.tp))
     { Print("Clunoid Gold: broker stop distance rejects these levels — skipping."); return; }

   g_trade.SetTypeFillingBySymbol(g_sym);
   bool sent = (s.dir>0)
               ? g_trade.Buy (lots,g_sym,0.0,s.sl,s.tp,"Clunoid Gold")
               : g_trade.Sell(lots,g_sym,0.0,s.sl,s.tp,"Clunoid Gold");
   if(!sent) { Succeeded("entry"); return; }
   if(!Succeeded("entry")) return;

   g_lastEntryTime = TimeCurrent();
   g_lastEntryTF   = s.tf;
   double rr = (s.risk>0.0) ? MathAbs(s.tp-s.price)/s.risk : 0.0;
   PrintFormat("Clunoid Gold: %s %.2f %s @ %.*f | SL %.*f | TP %.*f | %.1fR | confidence %.0f | %s%s",
               s.dir>0?"BUY":"SELL", lots, g_sym, g_digits, s.price, g_digits, s.sl, g_digits, s.tp,
               rr, s.conf, TFName(s.tf), sameDir>0?" (add)":"");
  }

bool AllInProfit(const int dir)
  {
   bool any=false;
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return(false);
   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong t = PositionGetTicket(i);
      if(t==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=g_sym) continue;
      long ptype = PositionGetInteger(POSITION_TYPE);
      int pdir = (ptype==POSITION_TYPE_BUY)?1:-1;
      if(pdir!=dir) continue;
      any=true;
      double open = PositionGetDouble(POSITION_PRICE_OPEN);
      double now  = (pdir>0)?tk.bid:tk.ask;
      if((pdir>0 && now<=open) || (pdir<0 && now>=open)) return(false);
     }
   return(any);
  }

//+------------------------------------------------------------------+
//| MANAGEMENT — partials, break-even, trailing, invalidation        |
//+------------------------------------------------------------------+
/**
 * Runs on CLOSED BARS ONLY — the same cadence the strategy was validated at.
 * The protective stop and target already sit on the server, so the account is
 * covered tick-by-tick; what waits for the bar is the DECISION to move them.
 * Re-deciding on every tick makes the trail dramatically tighter than tested
 * and shakes the EA out of trades it should still be holding.
 */
void ManagePositions()
  {
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return;

   for(int i=PositionsTotal()-1;i>=0;i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket==0) continue;
      if(PositionGetInteger(POSITION_MAGIC)!=InpMagic) continue;
      if(PositionGetString(POSITION_SYMBOL)!=g_sym) continue;

      long   ptype = PositionGetInteger(POSITION_TYPE);
      int    dir   = (ptype==POSITION_TYPE_BUY)?1:-1;
      double open  = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl    = PositionGetDouble(POSITION_SL);
      double tp    = PositionGetDouble(POSITION_TP);
      double vol   = PositionGetDouble(POSITION_VOLUME);
      double now   = (dir>0)?tk.bid:tk.ask;

      // Once the stop has been pulled to break-even we no longer know the original
      // risk distance from the position alone — but we do know we only move it there
      // after banking at 1R, so "already past 1R" is established fact rather than
      // something to re-derive from a made-up number.
      bool   atBE   = (sl>0.0) && ((dir>0 && sl>=open) || (dir<0 && sl<=open));
      bool   inProfit = (dir>0) ? (now>open) : (now<open);
      double riskDist = (sl>0.0 && !atBE) ? MathAbs(open-sl) : 0.0;
      double R = (riskDist>0.0) ? ((dir>0) ? (now-open)/riskDist : (open-now)/riskDist) : 0.0;
      bool   past1R = atBE || (riskDist>0.0 && R >= 1.0);

      double atr = CurrentATR();
      if(atr<=0.0 && riskDist>0.0) atr = riskDist;
      if(atr<=0.0) continue;                       // nothing sane to trail against

      // ---- 1. bank a partial at 1R and remove the risk ---------------------
      if(InpEnablePartials && !atBE && riskDist>0.0 && R >= PARTIAL_AT_R)
        {
         double half = NormalizeVolume(vol*0.5);
         double vmin = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN);
         // Both sides of the split must be tradeable, else we can only go to BE.
         // The tolerance matters: 0.02-0.01 is 0.00999...8 in binary, so an exact
         // >= test silently refuses to ever bank a partial on a minimum-size trade.
         double tol = 1e-8;
         if(half>=vmin-tol && (vol-half)>=vmin-tol && !FrozenForClose(dir,sl,tp))
           {
            g_trade.SetTypeFillingBySymbol(g_sym);
            if(g_trade.PositionClosePartial(ticket,half) && Succeeded("partial close"))
               PrintFormat("Clunoid Gold: banked %.2f lots at %.1fR, letting the rest run.", half, R);
           }
         // move to break-even whether or not the split was possible
         double be = open;
         if(!Frozen(dir,be) && StopsValidFor(dir,be,tp))
            if(g_trade.PositionModify(ticket,NormalizeDouble(be,g_digits),tp))
               Succeeded("break-even");
         continue;
        }

      // ---- 2. trail once clearly in profit --------------------------------
      if(InpEnableTrailing && past1R)
        {
         double trail = (dir>0) ? now - TRAIL_ATR*atr : now + TRAIL_ATR*atr;
         trail = NormalizeDouble(trail,g_digits);
         // Only move the stop when it is a MEANINGFUL improvement. Nudging it on
         // every small advance floods the server with modify requests and ratchets
         // the trail far tighter than the tested behaviour.
         double minStep = 0.10*atr;
         bool better = (dir>0) ? (sl<=0.0 || trail > sl+minStep)
                               : (sl<=0.0 || trail < sl-minStep);
         if(better && !Frozen(dir,trail) && StopsValidFor(dir,trail,tp))
            if(g_trade.PositionModify(ticket,trail,tp))
               Succeeded("trail");
        }

      // ---- 3. conditions changed: bank a WINNER when the trend flips ------
      if(InpCloseOnFlip && inProfit && TrendFlipped(dir))
        {
         if(!FrozenForClose(dir,sl,tp))
           {
            g_trade.SetTypeFillingBySymbol(g_sym);
            if(g_trade.PositionClose(ticket) && Succeeded("flip exit"))
               Print("Clunoid Gold: trend flipped while the trade was green — took the profit.");
           }
        }
     }
  }

/** Stops-level check against an explicit level pair (used when modifying). */
bool StopsValidFor(const int dir, const double sl, const double tp)
  {
   MqlTick tk; if(!SymbolInfoTick(g_sym,tk)) return(false);
   double lvl = StopsLevelPrice();
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

double CurrentATR()
  {
   if(g_tfN<=0) return(0.0);
   double atr[];
   for(int i=0;i<g_tfN;i++)
      if(g_tf[i].entry==g_lastEntryTF && Buf(g_tf[i].hAtr,0,3,atr))
         return(atr[1]);
   if(Buf(g_tf[0].hAtr,0,3,atr)) return(atr[1]);
   return(0.0);
  }

/** Has the entry timeframe's own trend turned against this direction? */
bool TrendFlipped(const int dir)
  {
   for(int i=0;i<g_tfN;i++)
     {
      if(g_tf[i].entry!=g_lastEntryTF) continue;
      double f[],s[];
      if(!Buf(g_tf[i].hEmaF,0,3,f) || !Buf(g_tf[i].hEmaS,0,3,s)) return(false);
      return(dir>0 ? (f[1]<s[1]) : (f[1]>s[1]));
     }
   return(false);
  }

string TFName(const ENUM_TIMEFRAMES tf)
  {
   if(tf==PERIOD_M15) return("M15");
   if(tf==PERIOD_H1)  return("H1");
   if(tf==PERIOD_H4)  return("H4");
   return(EnumToString(tf));
  }

//+------------------------------------------------------------------+
//| Startup report — tells the user immediately whether their         |
//| account can actually trade gold at their chosen risk.             |
//+------------------------------------------------------------------+
void StartupReport()
  {
   double bal   = AccountInfoDouble(ACCOUNT_BALANCE);
   string cur   = AccountInfoString(ACCOUNT_CURRENCY);
   double vmin  = SymbolInfoDouble(g_sym,SYMBOL_VOLUME_MIN);
   double atr   = CurrentATR();
   double typical = (atr>0.0) ? 1.6*atr : 0.0;      // a representative structural stop

   PrintFormat("Clunoid Gold EA v1.0 — %s | profile %s (%.2f%% per trade, %.1f%% total) | balance %.2f %s | %s account",
               g_sym, ProfileStr(), g_riskPct, g_maxOpenRiskPct, bal, cur,
               g_hedging ? "hedging" : "netting");

   if(!g_hedging && InpEnablePyramid)
      Print("Clunoid Gold: this is a NETTING account — adding to winners is disabled, because extra orders would merge into one position instead of stacking.");

   if(typical>0.0)
     {
      double lpl = LossPerLot(typical);
      if(lpl>0.0)
        {
         double riskAtMin = lpl*vmin;
         double pct = (bal>0.0) ? riskAtMin/bal*100.0 : 0.0;
         PrintFormat("Clunoid Gold: a typical %.2f-wide stop costs %.2f %s at the minimum %.2f lots = %.2f%% of your balance.",
                     typical, riskAtMin, cur, vmin, pct);
         if(pct > g_maxOpenRiskPct)
            PrintFormat("Clunoid Gold: WARNING — that already exceeds your %.1f%% cap, so most setups will be SKIPPED. Gold needs roughly %.0f %s to trade this profile properly.",
                        g_maxOpenRiskPct, riskAtMin*100.0/g_riskPct, cur);
         else if(pct > g_riskPct*1.5)
            PrintFormat("Clunoid Gold: note — the minimum lot risks more than your %.2f%% target, so position size is floored by the broker until the balance grows.", g_riskPct);
        }
     }
  }

//+------------------------------------------------------------------+
int OnInit()
  {
   ApplyProfile();

   g_sym = ResolveGold();
   if(g_sym=="")
     {
      Print("Clunoid Gold: could not find a tradable gold symbol. Open Market Watch, show your broker's XAUUSD, or set the Gold symbol input manually.");
      return(INIT_FAILED);
     }
   g_point  = SymbolInfoDouble(g_sym,SYMBOL_POINT);
   g_digits = (int)SymbolInfoInteger(g_sym,SYMBOL_DIGITS);
   g_hedging = (AccountInfoInteger(ACCOUNT_MARGIN_MODE)==ACCOUNT_MARGIN_MODE_RETAIL_HEDGING);

   g_trade.SetExpertMagicNumber(InpMagic);
   g_trade.SetDeviationInPoints(30);
   g_trade.SetTypeFillingBySymbol(g_sym);

   g_tfN = 0;
   if(!AddSlot(InpUseM15,"M15/H1", PERIOD_M15, PERIOD_H1)) return(INIT_FAILED);
   if(!AddSlot(InpUseH1, "H1/H4",  PERIOD_H1,  PERIOD_H4)) return(INIT_FAILED);
   if(!AddSlot(InpUseH4, "H4/D1",  PERIOD_H4,  PERIOD_D1)) return(INIT_FAILED);
   if(g_tfN==0)
     {
      Print("Clunoid Gold: every timeframe is switched off — enable at least one (H1 is the tested one).");
      return(INIT_FAILED);
     }

   RollDay();
   StartupReport();

   // Analyse immediately on attach, exactly as the user expects, and act if a
   // clean setup is already on the table.
   Print("Clunoid Gold: analysing the market now...");
   Setup s = BestSetup(true);
   if(s.valid)
     {
      PrintFormat("Clunoid Gold: clearest read is %s on %s at %.0f confidence.",
                  s.dir>0?"LONG":"SHORT", TFName(s.tf), s.conf);
      TryEnter(s);
     }
   else
      Print("Clunoid Gold: no qualifying setup yet — waiting for a pullback in the direction of the trend.");

   return(INIT_SUCCEEDED);
  }

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
  {
   for(int i=0;i<g_tfN;i++)
     {
      IndicatorRelease(g_tf[i].hEmaF);   IndicatorRelease(g_tf[i].hEmaS);
      IndicatorRelease(g_tf[i].hAdx);    IndicatorRelease(g_tf[i].hAtr);
      IndicatorRelease(g_tf[i].hBiasF);  IndicatorRelease(g_tf[i].hBiasS);
      IndicatorRelease(g_tf[i].hBiasAdx);
     }
  }

//+------------------------------------------------------------------+
void OnTick()
  {
   RollDay();

   // Every decision — entries and trade management alike — is made on CLOSED
   // bars, so the EA never acts on a candle that can still change shape.
   bool newBar = false;
   for(int i=0;i<g_tfN;i++)
     {
      datetime t = (datetime)SeriesInfoInteger(g_sym,g_tf[i].entry,SERIES_LASTBAR_DATE);
      if(t!=0 && t!=g_lastBarSeen[i]) { g_lastBarSeen[i]=t; newBar=true; }
     }
   if(!newBar) return;

   ManagePositions();

   if(!TradingAllowed()) return;
   Setup s = BestSetup(false);
   if(s.valid) TryEnter(s);
  }
//+------------------------------------------------------------------+
