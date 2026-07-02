"use client";

/**
 * Curated vector icon library for the motion engine — lucide icon path data drawn
 * straight onto the canvas (crisp at any size, stroke-styled like professional
 * motion-graphics icon systems). Named imports keep the bundle tree-shaken; Opus is
 * given exactly this list to choose from, so every icon it names resolves.
 */
import {
  Rocket, Brain, Cpu, Zap, Shield, ShieldCheck, Lock, Globe, TrendingUp, TrendingDown, BarChart3, PieChart, LineChart,
  Landmark, Coins, Wallet, CreditCard, DollarSign, Bitcoin, PiggyBank, Receipt, Percent, Scale,
  Atom, FlaskConical, Microscope, Telescope, Dna, Magnet, Orbit, Radiation,
  HeartPulse, Stethoscope, Pill, Syringe, Activity, Heart,
  Leaf, Sun, Moon, Star, Cloud, CloudLightning, Flame, Droplets, Wind, Mountain, TreePine, Sprout, Snowflake,
  Building2, Factory, Home, Store, Briefcase, ShoppingCart, Package, Truck, Plane, Car, Train, Ship, Bike,
  Satellite, Wifi, Signal, Smartphone, Laptop, Monitor, Server, Database, HardDrive, Router, Bluetooth, Battery,
  Code, Terminal, GitBranch, Bug, Blocks, Binary, QrCode, ScanLine,
  Settings, Wrench, Hammer, Cog, SlidersHorizontal, ToggleRight,
  Users, User, UserPlus, UserCheck, MessageCircle, MessagesSquare, Mail, Send, Bell, Megaphone, Share2, ThumbsUp,
  Calendar, Clock, Timer, Hourglass, AlarmClock, History,
  Search, Eye, Target, Crosshair, Compass, MapPin, Map as MapIcon, Navigation, Route, Milestone, Signpost,
  Award, Trophy, Medal, Crown, Gem, Gift, Sparkles, Wand2, PartyPopper,
  Lightbulb, BookOpen, GraduationCap, Pencil, PenTool, Palette, Brush, Camera, Video, Film, Clapperboard,
  Music, Mic, Headphones, Radio, Gamepad2, Dice5, Puzzle, Dumbbell, Bot,
  Key, KeyRound, Fingerprint, EyeOff, AlertTriangle, BadgeCheck, CheckCircle2, XCircle, CircleHelp, Info,
  ArrowRight, ArrowUpRight, RefreshCw, Repeat, Layers, Filter, Link as LinkIcon, Infinity as InfinityIcon,
  Banknote, ChartCandlestick, HandCoins, BadgeDollarSign, Vault, ArrowLeftRight, CircleDollarSign,
  Apple, Utensils, Coffee, Pizza, ChefHat, Salad, Beef,
  Stamp, Scroll, Swords, Castle, Church, Pyramid, Anchor, Skull, Ghost,
  type IconNode,
} from "lucide";

const REGISTRY: Record<string, IconNode> = {
  rocket: Rocket, brain: Brain, cpu: Cpu, zap: Zap, shield: Shield, "shield-check": ShieldCheck, lock: Lock, globe: Globe,
  "trending-up": TrendingUp, "trending-down": TrendingDown, "bar-chart": BarChart3, "pie-chart": PieChart, "line-chart": LineChart,
  landmark: Landmark, coins: Coins, wallet: Wallet, "credit-card": CreditCard, "dollar-sign": DollarSign, bitcoin: Bitcoin,
  "piggy-bank": PiggyBank, receipt: Receipt, percent: Percent, scale: Scale, banknote: Banknote, "chart-candlestick": ChartCandlestick,
  "hand-coins": HandCoins, "badge-dollar": BadgeDollarSign, vault: Vault, "arrow-left-right": ArrowLeftRight, "circle-dollar": CircleDollarSign,
  atom: Atom, flask: FlaskConical, microscope: Microscope, telescope: Telescope, dna: Dna, magnet: Magnet, orbit: Orbit, radiation: Radiation,
  "heart-pulse": HeartPulse, stethoscope: Stethoscope, pill: Pill, syringe: Syringe, activity: Activity, heart: Heart,
  leaf: Leaf, sun: Sun, moon: Moon, star: Star, cloud: Cloud, "cloud-lightning": CloudLightning, flame: Flame, droplets: Droplets,
  wind: Wind, mountain: Mountain, "tree-pine": TreePine, sprout: Sprout, snowflake: Snowflake,
  building: Building2, factory: Factory, home: Home, store: Store, briefcase: Briefcase, "shopping-cart": ShoppingCart,
  package: Package, truck: Truck, plane: Plane, car: Car, train: Train, ship: Ship, bike: Bike,
  satellite: Satellite, wifi: Wifi, signal: Signal, smartphone: Smartphone, laptop: Laptop, monitor: Monitor,
  server: Server, database: Database, "hard-drive": HardDrive, router: Router, bluetooth: Bluetooth, battery: Battery,
  code: Code, terminal: Terminal, "git-branch": GitBranch, bug: Bug, blocks: Blocks, binary: Binary, "qr-code": QrCode, scan: ScanLine,
  settings: Settings, wrench: Wrench, hammer: Hammer, cog: Cog, sliders: SlidersHorizontal, toggle: ToggleRight,
  users: Users, user: User, "user-plus": UserPlus, "user-check": UserCheck, "message-circle": MessageCircle,
  messages: MessagesSquare, mail: Mail, send: Send, bell: Bell, megaphone: Megaphone, share: Share2, "thumbs-up": ThumbsUp,
  calendar: Calendar, clock: Clock, timer: Timer, hourglass: Hourglass, alarm: AlarmClock, history: History,
  search: Search, eye: Eye, target: Target, crosshair: Crosshair, compass: Compass, "map-pin": MapPin, map: MapIcon,
  navigation: Navigation, route: Route, milestone: Milestone, signpost: Signpost,
  award: Award, trophy: Trophy, medal: Medal, crown: Crown, gem: Gem, gift: Gift, sparkles: Sparkles, wand: Wand2, party: PartyPopper,
  lightbulb: Lightbulb, "book-open": BookOpen, "graduation-cap": GraduationCap, pencil: Pencil, "pen-tool": PenTool,
  palette: Palette, brush: Brush, camera: Camera, video: Video, film: Film, clapperboard: Clapperboard,
  music: Music, mic: Mic, headphones: Headphones, radio: Radio, gamepad: Gamepad2, dice: Dice5, puzzle: Puzzle, dumbbell: Dumbbell, bot: Bot,
  key: Key, "key-round": KeyRound, fingerprint: Fingerprint, "eye-off": EyeOff, "alert-triangle": AlertTriangle,
  "badge-check": BadgeCheck, "check-circle": CheckCircle2, "x-circle": XCircle, help: CircleHelp, info: Info,
  "arrow-right": ArrowRight, "arrow-up-right": ArrowUpRight, refresh: RefreshCw, repeat: Repeat, layers: Layers,
  filter: Filter, link: LinkIcon, infinity: InfinityIcon,
  apple: Apple, utensils: Utensils, coffee: Coffee, pizza: Pizza, "chef-hat": ChefHat, salad: Salad, beef: Beef,
  stamp: Stamp, scroll: Scroll, swords: Swords, castle: Castle, church: Church, pyramid: Pyramid, anchor: Anchor, skull: Skull, ghost: Ghost,
};

/** The list Opus picks from lives in spec.ts (server-safe); this is the local mirror. */
const ICON_NAMES = Object.keys(REGISTRY);

/** Loose lookup: exact name, else a forgiving normalized match, else a fallback. */
export function iconNode(name?: string): IconNode | null {
  if (!name) return null;
  const k = name.toLowerCase().trim().replace(/[\s_]+/g, "-");
  if (REGISTRY[k]) return REGISTRY[k];
  const flat = k.replace(/-/g, "");
  if (flat.length < 2) return null; // a degenerate name must not substring-match everything
  for (const key of ICON_NAMES) if (key.replace(/-/g, "") === flat) return REGISTRY[key];
  for (const key of ICON_NAMES) if (key.includes(k) || k.includes(key)) return REGISTRY[key];
  return null;
}

/**
 * Draw a lucide icon centered at (cx, cy) with size `s` (icon bounding box), stroked in
 * `color`. `t` 0→1 animates a professional "draw-on" (line-dash reveal) when < 1.
 */
export function drawIcon(ctx: CanvasRenderingContext2D, node: IconNode, cx: number, cy: number, s: number, color: string, t = 1, lineWidth = 2) {
  const k = s / 24; // lucide icons are 24×24
  ctx.save();
  ctx.translate(cx - s / 2, cy - s / 2);
  ctx.scale(k, k);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.fillStyle = "transparent";
  if (t < 1) {
    // draw-on reveal: dash the whole icon and slide the dash in
    const L = 120; // generous virtual path length per shape
    ctx.setLineDash([L, L]);
    ctx.lineDashOffset = L * (1 - Math.max(0, Math.min(1, t)));
  }
  for (const [tag, attrs] of node as [string, Record<string, string>][]) {
    const a = attrs || {};
    ctx.beginPath();
    switch (tag) {
      case "path":
        if (a.d) ctx.stroke(new Path2D(a.d));
        continue;
      case "circle":
        ctx.arc(Number(a.cx), Number(a.cy), Number(a.r), 0, Math.PI * 2);
        break;
      case "ellipse":
        ctx.ellipse(Number(a.cx), Number(a.cy), Number(a.rx), Number(a.ry), 0, 0, Math.PI * 2);
        break;
      case "rect": {
        const r = Number(a.rx || 0);
        const x = Number(a.x), y = Number(a.y), w = Number(a.width), h = Number(a.height);
        if (r > 0) {
          ctx.moveTo(x + r, y);
          ctx.arcTo(x + w, y, x + w, y + h, r);
          ctx.arcTo(x + w, y + h, x, y + h, r);
          ctx.arcTo(x, y + h, x, y, r);
          ctx.arcTo(x, y, x + w, y, r);
          ctx.closePath();
        } else ctx.rect(x, y, w, h);
        break;
      }
      case "line":
        ctx.moveTo(Number(a.x1), Number(a.y1));
        ctx.lineTo(Number(a.x2), Number(a.y2));
        break;
      case "polyline":
      case "polygon": {
        const pts = (a.points || "").trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) {
          if (i === 0) ctx.moveTo(pts[i], pts[i + 1]);
          else ctx.lineTo(pts[i], pts[i + 1]);
        }
        if (tag === "polygon") ctx.closePath();
        break;
      }
      default:
        continue;
    }
    ctx.stroke();
  }
  ctx.restore();
}
