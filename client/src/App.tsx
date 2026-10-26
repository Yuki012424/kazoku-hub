import React, { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeftRight,
  Bell,
  Calculator,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CloudSun,
  Clock3,
  Home,
  LayoutGrid,
  MapPin,
  Menu,
  MessageSquare,
  Minus,
  Moon,
  MoreHorizontal,
  PackageCheck,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Ruler,
  Save,
  Search,
  Settings,
  ShoppingBasket,
  ShieldCheck,
  Sparkles,
  Sun,
  Timer,
  Trash2,
  Utensils,
  Users,
  Volume2,
  Wind,
  X,
} from "lucide-react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

type View = "home" | "family" | "tools" | "settings";
type BoardTab = "shopping" | "dinner" | "messages" | "trash" | "stock";
type ToolTab = "calculator" | "pomodoro" | "weather" | "converter" | "sound";
type QuickType = "shopping" | "message" | "dinner" | "stock";
type CalculatorMode = "split" | "change";
type ChangeRow = { id: string; name: string; amount: string; paid: string };
type FamilyMember = { openId: string; displayName: string; role: "owner" | "member" };
type FamilyGroup = { groupId: number; groupName: string; inviteCode: string; role: "owner" | "member"; members: FamilyMember[] };

type ShoppingItem = { id: string; store: string; item: string; sale: string; done: boolean };
type TodoItem = { id: string; text: string; done: boolean };
type StockItem = { id: string; name: string; date: string };
type TrashPlan = { day: string; type: string; note?: string };
type HubState = {
  householdName: string;
  memberNames: string[];
  message: string;
  shopping: ShoppingItem[];
  storeHistory: string[];
  dinner: { statuses: Record<string, string>; requests: string[]; menu: string };
  todos: TodoItem[];
  trash: TrashPlan[];
  stock: StockItem[];
};

const LOCAL_KEY = "kazoku-hub-state-v1";
const ACTIVE_GROUP_KEY = "kazoku-hub-active-group-v1";
const TOUR_KEY = "kazoku-hub-tour-dismissed";
const defaultMembers = ["ゆうき", "あおい", "そら"];
const dinnerOptions = ["食べる", "いらない", "帰宅が遅くなる", "外食・各自"];
const defaultState: HubState = {
  householdName: "わが家",
  memberNames: defaultMembers,
  message: "今週も、無理なく助け合おう。",
  shopping: [
    { id: "s1", store: "スーパー", item: "牛乳", sale: "木曜はポイント2倍", done: false },
    { id: "s2", store: "ドラッグストア", item: "洗剤", sale: "", done: false },
    { id: "s3", store: "スーパー", item: "バナナ", sale: "", done: true },
  ],
  storeHistory: ["スーパー", "コンビニ", "ドラッグストア"],
  dinner: {
    statuses: { ゆうき: "食べる", あおい: "帰宅が遅くなる", そら: "食べる" },
    requests: ["具だくさんの味噌汁"],
    menu: "鮭のホイル焼きと味噌汁",
  },
  todos: [
    { id: "t1", text: "学校のお知らせを確認する", done: false },
    { id: "t2", text: "週末の予定をカレンダーに入れる", done: true },
  ],
  trash: [
    { day: "月", type: "可燃ごみ", note: "朝8:00まで" },
    { day: "火", type: "ペットボトル・缶" },
    { day: "水", type: "プラスチック" },
    { day: "木", type: "可燃ごみ", note: "朝8:00まで" },
    { day: "金", type: "古紙・段ボール" },
    { day: "土", type: "なし" },
    { day: "日", type: "なし" },
  ],
  stock: [
    { id: "b1", name: "保存水 2L", date: "2027-12-31" },
    { id: "b2", name: "アルファ米", date: "2026-09-01" },
  ],
};

const cloneDefault = (): HubState => JSON.parse(JSON.stringify(defaultState)) as HubState;

function normalizeState(value: unknown): HubState {
  if (!value || typeof value !== "object") return cloneDefault();
  const candidate = value as Partial<HubState>;
  const dinner = candidate.dinner && typeof candidate.dinner === "object" ? candidate.dinner as Partial<HubState["dinner"]> : {};
  return {
    ...cloneDefault(),
    ...candidate,
    memberNames: Array.isArray(candidate.memberNames) && candidate.memberNames.length > 0
      ? candidate.memberNames.map(name => String(name || "家族")).slice(0, 6)
      : defaultMembers,
    shopping: Array.isArray(candidate.shopping) ? candidate.shopping : cloneDefault().shopping,
    storeHistory: Array.isArray(candidate.storeHistory) ? candidate.storeHistory : cloneDefault().storeHistory,
    todos: Array.isArray(candidate.todos) ? candidate.todos : cloneDefault().todos,
    trash: Array.isArray(candidate.trash) ? candidate.trash : cloneDefault().trash,
    stock: Array.isArray(candidate.stock) ? candidate.stock : cloneDefault().stock,
    dinner: {
      statuses: dinner.statuses && typeof dinner.statuses === "object" ? dinner.statuses as Record<string, string> : cloneDefault().dinner.statuses,
      requests: Array.isArray(dinner.requests) ? dinner.requests as string[] : [],
      menu: typeof dinner.menu === "string" ? dinner.menu : "",
    },
  };
}

function loadLocalState(storageKey = LOCAL_KEY): HubState {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normalizeState(JSON.parse(raw)) : cloneDefault();
  } catch {
    return cloneDefault();
  }
}

function bindStateToGroup(value: HubState, members: FamilyMember[]): HubState {
  if (members.length === 0) return value;
  const legacyNames = value.memberNames;
  const legacyStatuses = value.dinner.statuses;
  const statuses: Record<string, string> = {};
  members.forEach((member, index) => {
    statuses[member.openId] = legacyStatuses[member.openId]
      ?? legacyStatuses[member.displayName]
      ?? legacyStatuses[legacyNames[index]]
      ?? "未回答";
  });
  return {
    ...value,
    memberNames: members.map(member => member.displayName),
    dinner: { ...value.dinner, statuses },
  };
}

function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "short" }).format(date);
}

function daysUntil(date: string) {
  const target = new Date(`${date}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
}

function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function AppShell() {
  const { theme, toggleTheme } = useTheme();
  const auth = useAuth();
  const groupsQuery = trpc.family.list.useQuery(undefined, { enabled: auth.isAuthenticated, retry: false });
  const [activeGroupId, setActiveGroupId] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem(ACTIVE_GROUP_KEY));
    return Number.isInteger(stored) && stored > 0 ? stored : null;
  });
  const activeGroup = (groupsQuery.data as FamilyGroup[] | undefined)?.find(group => group.groupId === activeGroupId);
  const activeMembers = activeGroup?.members ?? [];
  const currentMember = activeMembers.find(member => member.openId === auth.user?.openId);
  const [view, setView] = useState<View>("home");
  const [boardTab, setBoardTab] = useState<BoardTab>("shopping");
  const [toolTab, setToolTab] = useState<ToolTab>("calculator");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [state, setState] = useState<HubState>(loadLocalState);
  const [syncText, setSyncText] = useState("この端末に保存中");
  const [tourDismissed, setTourDismissed] = useState(() => localStorage.getItem(TOUR_KEY) === "1");
  const [tourSlide, setTourSlide] = useState(0);
  const [modal, setModal] = useState<"quick" | "reset" | null>(null);
  const [quickType, setQuickType] = useState<QuickType>("shopping");
  const [shoppingDraft, setShoppingDraft] = useState({ store: "スーパー", item: "", sale: "" });
  const [messageDraft, setMessageDraft] = useState("");
  const [stockDraft, setStockDraft] = useState({ name: "", date: "" });
  const [memberDrafts, setMemberDrafts] = useState<string[]>(() => state.memberNames);
  const [profileDraft, setProfileDraft] = useState("");
  const [requestDraft, setRequestDraft] = useState("");
  const [menuDraft, setMenuDraft] = useState(state.dinner.menu);
  const [todoDraft, setTodoDraft] = useState("");
  const [stockName, setStockName] = useState("");
  const [stockDate, setStockDate] = useState("");
  const [expandedTrash, setExpandedTrash] = useState<string | null>(null);
  const [calcTotal, setCalcTotal] = useState("4800");
  const [calcPeople, setCalcPeople] = useState("3");
  const [calcTip, setCalcTip] = useState("0");
  const [calculatorMode, setCalculatorMode] = useState<CalculatorMode>("change");
  const [changeRows, setChangeRows] = useState<ChangeRow[]>([
    { id: "payer-a", name: "A", amount: "1500", paid: "2000" },
    { id: "payer-b", name: "B", amount: "2200", paid: "2700" },
  ]);
  const [pomoSeconds, setPomoSeconds] = useState(25 * 60);
  const [pomoRunning, setPomoRunning] = useState(false);
  const [pomoMode, setPomoMode] = useState<"集中" | "休憩">("集中");
  const [weatherCity, setWeatherCity] = useState("東京");
  const [weather, setWeather] = useState({ temp: "--", label: "地域を選んで天気を取得", loaded: false });
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [convertCategory, setConvertCategory] = useState("length");
  const [convertFrom, setConvertFrom] = useState("cm");
  const [convertTo, setConvertTo] = useState("inch");
  const [convertValue, setConvertValue] = useState("30");
  const [soundOn, setSoundOn] = useState(false);
  const audioRef = useRef<AudioContext | null>(null);
  const noiseRef = useRef<OscillatorNode | null>(null);
  const saveMutation = trpc.hub.saveState.useMutation();
  const profileMutation = trpc.family.updateProfile.useMutation();
  const cloudState = trpc.hub.getState.useQuery({ groupId: activeGroupId ?? 0 }, { enabled: Boolean(auth.isAuthenticated && activeGroupId), retry: false });

  useEffect(() => {
    if (!groupsQuery.data) return;
    const groups = groupsQuery.data as FamilyGroup[];
    if (groups.length === 0) {
      setActiveGroupId(null);
      return;
    }
    const stored = Number(localStorage.getItem(ACTIVE_GROUP_KEY));
    const nextId = groups.some(group => group.groupId === stored)
      ? stored
      : groups[0].groupId;
    if (nextId !== activeGroupId) {
      setActiveGroupId(nextId);
      localStorage.setItem(ACTIVE_GROUP_KEY, String(nextId));
      setState(loadLocalState(`${LOCAL_KEY}-${nextId}`));
    }
  }, [groupsQuery.data, activeGroupId]);

  useEffect(() => {
    if (!activeGroupId || !activeMembers.length) return;
    setProfileDraft(currentMember?.displayName ?? "");
    setMemberDrafts(activeMembers.map(member => member.displayName));
  }, [activeGroupId, activeMembers, currentMember?.displayName]);

  useEffect(() => {
    if (!activeGroupId || cloudState.isLoading) return;
    const storageKey = `${LOCAL_KEY}-${activeGroupId}`;
    if (cloudState.data) {
      const next = bindStateToGroup(normalizeState(cloudState.data), activeMembers);
      setState(next);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSyncText("クラウドと同期済み");
    } else if (!cloudState.isError) {
      const next = bindStateToGroup(loadLocalState(storageKey), activeMembers);
      setState(next);
      setSyncText("この家族の端末に保存中");
    } else {
      setSyncText("同期できないため端末に保存中");
    }
  }, [activeGroupId, activeMembers, cloudState.data, cloudState.isError, cloudState.isLoading]);

  useEffect(() => {
    if (!pomoRunning) return;
    const timer = window.setInterval(() => {
      setPomoSeconds(prev => {
        if (prev > 1) return prev - 1;
        setPomoRunning(false);
        setPomoMode(mode => mode === "集中" ? "休憩" : "集中");
        toast.success("タイマーが一区切りしました");
        return pomoMode === "集中" ? 5 * 60 : 25 * 60;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [pomoRunning, pomoMode]);

  useEffect(() => () => {
    noiseRef.current?.stop();
    audioRef.current?.close();
  }, []);

  const commit = (next: HubState, message = "保存済み") => {
    setState(next);
    const storageKey = activeGroupId ? `${LOCAL_KEY}-${activeGroupId}` : LOCAL_KEY;
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (!activeGroupId) {
      if (message) toast.error("先に家族グループを作成または参加してください");
      return;
    }
    setSyncText("保存中…");
    saveMutation.mutate({ groupId: activeGroupId, state: next as unknown as Record<string, unknown> }, {
      onSuccess: () => setSyncText("クラウドと同期済み"),
      onError: () => setSyncText("この端末に保存中"),
    });
    if (message) toast.success(message);
  };

  const navigate = (next: View) => {
    setView(next);
    setSidebarOpen(false);
  };

  const remainingShopping = state.shopping.filter(item => !item.done);
  const remainingTodos = state.todos.filter(item => !item.done);
  const stockAlerts = state.stock.filter(item => daysUntil(item.date) <= 30);
  const familyMemberRecords: FamilyMember[] = activeMembers.length > 0
    ? activeMembers
    : state.memberNames.map((displayName, index) => ({ openId: `legacy-${index}`, displayName, role: "member" as const }));
  const familyMembers = familyMemberRecords.map(member => member.displayName);
  const currentMemberName = currentMember?.displayName ?? familyMembers[0] ?? "自分";
  const dinnerStatusFor = (member: FamilyMember) => state.dinner.statuses[member.openId] ?? state.dinner.statuses[member.displayName] ?? "未回答";
  const statusSummary = familyMemberRecords.filter(member => dinnerStatusFor(member) === "食べる").length;

  const saveProfileName = () => {
    const nextName = profileDraft.trim();
    if (!activeGroupId || !nextName || !auth.user) return toast.error("表示名を入力してください");
    profileMutation.mutate({ groupId: activeGroupId, displayName: nextName }, {
      onSuccess: async () => {
        await groupsQuery.refetch();
        toast.success("表示名を保存しました");
      },
      onError: error => toast.error(error.message),
    });
  };

  const addShopping = (draft = shoppingDraft) => {
    if (!draft.item.trim()) return toast.error("買うものを入力してください");
    const store = draft.store.trim() || "その他";
    const next: HubState = {
      ...state,
      shopping: [...state.shopping, { id: uid("shop"), store, item: draft.item.trim(), sale: draft.sale.trim(), done: false }],
      storeHistory: [store, ...state.storeHistory.filter(item => item !== store)].slice(0, 5),
    };
    commit(next, "買い物リストに追加しました");
    setShoppingDraft({ store, item: "", sale: "" });
  };

  const addMessage = (text = messageDraft) => {
    if (!text.trim()) return toast.error("伝言を入力してください");
    commit({ ...state, todos: [{ id: uid("todo"), text: text.trim(), done: false }, ...state.todos] }, "伝言を置きました");
    setMessageDraft("");
  };

  const addRequest = () => {
    if (!requestDraft.trim()) return;
    commit({ ...state, dinner: { ...state.dinner, requests: [...state.dinner.requests, requestDraft.trim()] } }, "リクエストを追加しました");
    setRequestDraft("");
  };

  const addStock = (draft = { name: stockName, date: stockDate }) => {
    if (!draft.name.trim() || !draft.date) return toast.error("品名と期限を入力してください");
    commit({ ...state, stock: [...state.stock, { id: uid("stock"), name: draft.name.trim(), date: draft.date }] }, "備蓄を登録しました");
    setStockName("");
    setStockDate("");
  };

  const addQuickItem = () => {
    if (quickType === "shopping") addShopping(shoppingDraft);
    if (quickType === "message") addMessage(messageDraft);
    if (quickType === "dinner") addRequest();
    if (quickType === "stock") addStock(stockDraft);
    setModal(null);
  };

  const changeView = (next: View) => {
    if (next === "family") setBoardTab("shopping");
    if (next === "tools") setToolTab("calculator");
    navigate(next);
  };

  const updateDinnerStatus = (status: string) => {
    const memberKey = auth.user?.openId ?? familyMemberRecords[0]?.openId ?? currentMemberName;
    commit({ ...state, dinner: { ...state.dinner, statuses: { ...state.dinner.statuses, [memberKey]: status } } }, "夕飯の予定を更新しました");
  };

  const toggleShopping = (id: string) => {
    commit({ ...state, shopping: state.shopping.map(item => item.id === id ? { ...item, done: !item.done } : item) }, "買い物リストを更新しました");
  };

  const toggleTodo = (id: string) => {
    commit({ ...state, todos: state.todos.map(item => item.id === id ? { ...item, done: !item.done } : item) }, "伝言を更新しました");
  };

  const deleteTodo = (id: string) => commit({ ...state, todos: state.todos.filter(item => item.id !== id) }, "伝言を削除しました");
  const deleteStock = (id: string) => commit({ ...state, stock: state.stock.filter(item => item.id !== id) }, "備蓄を削除しました");

  const updateMenu = () => {
    commit({ ...state, dinner: { ...state.dinner, menu: menuDraft.trim() } }, "今日のメニューを決定しました");
  };

  const groupedShopping = useMemo(() => {
    return remainingShopping.reduce<Record<string, ShoppingItem[]>>((groups, item) => {
      (groups[item.store] ||= []).push(item);
      return groups;
    }, {});
  }, [remainingShopping]);

  const dismissTour = () => {
    localStorage.setItem(TOUR_KEY, "1");
    setTourDismissed(true);
  };

  const resetAll = () => {
    const next = cloneDefault();
    commit(next, "サンプルデータに戻しました");
    setModal(null);
  };

  const timeLabel = `${String(Math.floor(pomoSeconds / 60)).padStart(2, "0")}:${String(pomoSeconds % 60).padStart(2, "0")}`;
  const calcPerPerson = Math.ceil((Number(calcTotal || 0) + Number(calcTip || 0)) / Math.max(Number(calcPeople || 1), 1));
  const changeSummary = useMemo(() => changeRows.map(row => ({
    ...row,
    amountValue: Number(row.amount || 0),
    paidValue: Number(row.paid || 0),
    change: Number(row.paid || 0) - Number(row.amount || 0),
  })), [changeRows]);
  const changeTotals = useMemo(() => ({
    amount: changeSummary.reduce((sum, row) => sum + row.amountValue, 0),
    paid: changeSummary.reduce((sum, row) => sum + row.paidValue, 0),
    change: changeSummary.reduce((sum, row) => sum + row.change, 0),
  }), [changeSummary]);

  const fetchWeather = async () => {
    const coords: Record<string, [number, number]> = {
      東京: [35.6762, 139.6503], 大阪: [34.6937, 135.5023], 福岡: [33.5904, 130.4017], 札幌: [43.0618, 141.3545],
    };
    const [latitude, longitude] = coords[weatherCity] ?? coords.東京;
    setWeatherLoading(true);
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=Asia%2FTokyo`);
      const json = await res.json() as { current?: { temperature_2m?: number; weather_code?: number } };
      const code = json.current?.weather_code ?? 0;
      const label = code === 0 ? "快晴。軽い羽織りで気持ちよく" : code < 4 ? "晴れ。日差し対策を" : code < 70 ? "くもり。薄手の上着が安心" : "雨の可能性。傘を忘れずに";
      setWeather({ temp: `${Math.round(json.current?.temperature_2m ?? 0)}°C`, label, loaded: true });
    } catch {
      setWeather({ temp: "--", label: "天気を取得できませんでした", loaded: false });
      toast.error("天気情報を取得できませんでした");
    } finally {
      setWeatherLoading(false);
    }
  };

  const conversionUnits = convertCategory === "length" ? ["cm", "m", "inch"] : convertCategory === "weight" ? ["kg", "g", "lb"] : ["℃", "℉"];
  useEffect(() => {
    setConvertFrom(conversionUnits[0]);
    setConvertTo(conversionUnits[1]);
  }, [convertCategory]);
  const convertedValue = useMemo(() => {
    const raw = Number(convertValue || 0);
    if (convertFrom === convertTo) return raw.toFixed(2);
    if (convertCategory === "length") {
      const cm = convertFrom === "cm" ? raw : convertFrom === "m" ? raw * 100 : raw * 2.54;
      return (convertTo === "cm" ? cm : convertTo === "m" ? cm / 100 : cm / 2.54).toFixed(2);
    }
    if (convertCategory === "weight") {
      const g = convertFrom === "g" ? raw : convertFrom === "kg" ? raw * 1000 : raw * 453.592;
      return (convertTo === "g" ? g : convertTo === "kg" ? g / 1000 : g / 453.592).toFixed(2);
    }
    const c = convertFrom === "℃" ? raw : (raw - 32) * 5 / 9;
    return (convertTo === "℃" ? c : c * 9 / 5 + 32).toFixed(2);
  }, [convertCategory, convertFrom, convertTo, convertValue]);

  const toggleSound = () => {
    if (soundOn) {
      noiseRef.current?.stop();
      noiseRef.current = null;
      setSoundOn(false);
      return;
    }
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return toast.error("このブラウザは環境音に対応していません");
    const ctx = audioRef.current ?? new AudioCtor();
    audioRef.current = ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 174;
    gain.gain.value = 0.025;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    noiseRef.current = osc;
    setSoundOn(true);
  };

  const updateChangeRow = (id: string, field: "name" | "amount" | "paid", value: string) => {
    setChangeRows(rows => rows.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const addChangeRow = () => {
    setChangeRows(rows => [...rows, { id: uid("payer"), name: String.fromCharCode(65 + rows.length), amount: "", paid: "" }]);
  };

  const removeChangeRow = (id: string) => {
    setChangeRows(rows => rows.length > 1 ? rows.filter(row => row.id !== id) : rows);
  };

  const navItems = [
    { id: "home" as View, label: "今日", note: "家族の概況", icon: <Home size={18} /> },
    { id: "family" as View, label: "家族ボード", note: "共有する", icon: <LayoutGrid size={18} /> },
    { id: "tools" as View, label: "ひと息ツール", note: "整える", icon: <Sparkles size={18} /> },
    { id: "settings" as View, label: "設定", note: "好みに合わせる", icon: <Settings size={18} /> },
  ];

  const renderBreadcrumb = () => (
    <div className="breadcrumb" aria-label="パンくずリスト">
      <button onClick={() => navigate("home")}>今日</button>
      <ChevronRight size={14} />
      <span>{view === "family" ? "家族ボード" : view === "tools" ? "ひと息ツール" : "設定"}</span>
    </div>
  );

  const renderFamily = () => (
    <section className="page-section">
      {renderBreadcrumb()}
      <div className="page-title-row">
        <div>
          <p className="eyebrow">FAMILY BOARD / 共有スペース</p>
          <h1>家族ボード</h1>
          <p className="page-lede">暮らしの「あとで」を、みんなが見える場所へ。</p>
        </div>
        <button className="button button-primary" onClick={() => setModal("quick")}><Plus size={16} />クイック追加</button>
      </div>
      <div className="segmented-tabs board-tabs">
        {([['shopping', '買い物', <ShoppingBasket size={15} />], ['dinner', '夕飯', <Utensils size={15} />], ['messages', '伝言', <MessageSquare size={15} />], ['trash', 'ゴミ', <Trash2 size={15} />], ['stock', '防災', <ShieldCheck size={15} />]] as const).map(([id, label, icon]) => (
          <button key={id} className={boardTab === id ? "active" : ""} onClick={() => setBoardTab(id)}>{icon}{label}</button>
        ))}
      </div>
      {boardTab === "shopping" && (
        <div className="board-layout">
          <div className="panel accent-panel">
            <div className="panel-heading"><div><p className="eyebrow">SHOPPING NOTE</p><h2>買い物を、店ごとに。</h2></div><ShoppingBasket className="panel-icon" size={24} /></div>
            <div className="form-grid three">
              <label>店名<input value={shoppingDraft.store} list="stores" onChange={e => setShoppingDraft({ ...shoppingDraft, store: e.target.value })} placeholder="スーパー" /></label>
              <label>買うもの<input value={shoppingDraft.item} onChange={e => setShoppingDraft({ ...shoppingDraft, item: e.target.value })} onKeyDown={e => e.key === "Enter" && addShopping()} placeholder="例：卵、洗剤" /></label>
              <label>特売日メモ<input value={shoppingDraft.sale} onChange={e => setShoppingDraft({ ...shoppingDraft, sale: e.target.value })} placeholder="任意" /></label>
            </div>
            <datalist id="stores">{state.storeHistory.map(store => <option key={store} value={store} />)}</datalist>
            <button className="button button-dark" onClick={() => addShopping()}><Plus size={16} />リストに追加</button>
            <div className="history-row"><span className="mini-label">よく使う店</span>{state.storeHistory.map(store => <button key={store} className="chip" onClick={() => setShoppingDraft({ ...shoppingDraft, store })}>{store}</button>)}</div>
          </div>
          <div className="stack-list">
            {Object.keys(groupedShopping).length === 0 && <EmptyState icon={<Check size={22} />} title="買い物は完了です" text="必要になったものを追加しましょう。" />}
            {Object.entries(groupedShopping).map(([store, items]) => <div className="panel list-panel" key={store}><div className="store-heading"><span>{store}</span><span className="count-pill">{items.length}件</span></div>{items.map(item => <div className="list-row" key={item.id}><button className="check-button" onClick={() => toggleShopping(item.id)} aria-label={`${item.item}を完了`}><CircleCheck /></button><div className="row-main"><strong>{item.item}</strong>{item.sale && <span className="row-note">特売メモ：{item.sale}</span>}</div><button className="icon-button" onClick={() => toggleShopping(item.id)} title="完了"><Check size={15} /></button></div>)}</div>)}
          </div>
        </div>
      )}
      {boardTab === "dinner" && (
        <div className="board-layout dinner-layout">
          <div className="panel accent-panel coral-panel"><div className="panel-heading"><div><p className="eyebrow">DINNER CHECK-IN</p><h2>今日の夕飯、いる？</h2></div><Utensils className="panel-icon" size={24} /></div><div className="member-select"><div><span className="mini-label">あなたの回答</span><strong>{currentMemberName}</strong><small>ログイン中のアカウントで回答します</small></div><span className="status-mark">{auth.user ? dinnerStatusFor({ openId: auth.user.openId, displayName: currentMemberName, role: "member" }) : "未回答"}</span></div><div className="radio-grid">{dinnerOptions.map(option => { const myStatus = auth.user ? dinnerStatusFor({ openId: auth.user.openId, displayName: currentMemberName, role: "member" }) : "未回答"; return <label key={option} className={`radio-card ${myStatus === option ? "selected" : ""}`}><input type="radio" name="dinner-status" checked={myStatus === option} onChange={() => updateDinnerStatus(option)} />{option}</label>; })}</div><div className="member-status-list">{familyMemberRecords.map(member => <div key={member.openId}><span>{member.displayName}{member.openId === auth.user?.openId && <small>（あなた）</small>}</span><span className="status-pill">{dinnerStatusFor(member)}</span></div>)}</div></div>
          <div className="stack-list"><div className="panel"><div className="section-heading"><div><p className="eyebrow">REQUESTS</p><h3>食べたいもの</h3></div><MessageSquare size={20} /></div><div className="inline-form"><input value={requestDraft} onChange={e => setRequestDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && addRequest()} placeholder="リクエストをひとこと" /><button className="button button-primary" onClick={addRequest}><Plus size={15} />追加</button></div><div className="request-list">{state.dinner.requests.map((request, index) => <div className="request-chip" key={`${request}-${index}`}>{request}<button onClick={() => commit({ ...state, dinner: { ...state.dinner, requests: state.dinner.requests.filter((_, i) => i !== index) } }, "リクエストを削除しました")}><X size={13} /></button></div>)}</div></div><div className="panel menu-panel"><div className="section-heading"><div><p className="eyebrow">TONIGHT'S MENU</p><h3>今日の決定メニュー</h3></div><Pencil size={19} /></div><div className="inline-form"><input value={menuDraft} onChange={e => setMenuDraft(e.target.value)} placeholder="メニューを決める" /><button className="button button-coral" onClick={updateMenu}>決定</button></div>{state.dinner.menu && <p className="menu-result">{state.dinner.menu}</p>}</div></div>
        </div>
      )}
      {boardTab === "messages" && (
        <div className="board-layout"><div className="panel accent-panel purple-panel"><div className="panel-heading"><div><p className="eyebrow">MESSAGE BOARD</p><h2>伝言は、短く見やすく。</h2></div><MessageSquare className="panel-icon" size={24} /></div><div className="inline-form"><input value={todoDraft} onChange={e => setTodoDraft(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { addMessage(todoDraft); setTodoDraft(""); } }} placeholder="例：牛乳を冷蔵庫に入れておいて" /><button className="button button-dark" onClick={() => { addMessage(todoDraft); setTodoDraft(""); }}><Plus size={15} />置く</button></div><p className="form-hint">家族が見たらチェック。済んだ伝言はいつでも消せます。</p></div><div className="panel list-panel"><div className="store-heading"><span>みんなの伝言</span><span className="count-pill">未完了 {remainingTodos.length}</span></div>{state.todos.length === 0 && <EmptyState icon={<MessageSquare size={22} />} title="伝言はありません" text="思いついたことを気軽に置いてください。" />}{state.todos.map(todo => <div className={`list-row todo-row ${todo.done ? "done" : ""}`} key={todo.id}><button className={`check-button ${todo.done ? "checked" : ""}`} onClick={() => toggleTodo(todo.id)}>{todo.done ? <Check size={15} /> : <span />}</button><div className="row-main"><strong>{todo.text}</strong>{todo.done && <span className="row-note">完了</span>}</div><button className="icon-button danger" onClick={() => deleteTodo(todo.id)} title="削除"><Trash2 size={15} /></button></div>)}</div></div>
      )}
      {boardTab === "trash" && (
        <div className="board-layout"><div className="panel accent-panel blue-panel"><div className="panel-heading"><div><p className="eyebrow">WEEKLY ROUTINE</p><h2>ゴミ出しを忘れない。</h2></div><Trash2 className="panel-icon" size={24} /></div><p className="panel-copy">朝の支度と一緒に確認できるよう、曜日ごとにまとめています。クリックすると補足が開きます。</p><div className="trash-week">{state.trash.map(plan => <button key={plan.day} className={`day-card ${plan.type === "なし" ? "empty" : ""} ${expandedTrash === plan.day ? "selected" : ""}`} onClick={() => setExpandedTrash(expandedTrash === plan.day ? null : plan.day)}><span>{plan.day}</span><strong>{plan.type}</strong><ChevronDown size={15} /></button>)}</div></div><div className="panel"><div className="section-heading"><div><p className="eyebrow">DETAIL</p><h3>予定の詳細</h3></div><CalendarDays size={19} /></div>{state.trash.map(plan => <div className={`accordion-row ${expandedTrash === plan.day ? "open" : ""}`} key={plan.day}><button onClick={() => setExpandedTrash(expandedTrash === plan.day ? null : plan.day)}><span className="day-label">{plan.day}</span><span>{plan.type}</span><ChevronDown size={16} /></button>{expandedTrash === plan.day && <div className="accordion-content">{plan.type === "なし" ? "今日は回収がありません。" : plan.note ?? "前日の夜にまとめておくと安心です。"}</div>}</div>)}</div></div>
      )}
      {boardTab === "stock" && (
        <div className="board-layout"><div className="panel accent-panel green-panel"><div className="panel-heading"><div><p className="eyebrow">EMERGENCY STOCK</p><h2>備えを、見える場所に。</h2></div><ShieldCheck className="panel-icon" size={24} /></div><div className="form-grid two"><label>品名<input value={stockName} onChange={e => setStockName(e.target.value)} placeholder="保存水 2L" /></label><label>賞味期限<input type="date" value={stockDate} onChange={e => setStockDate(e.target.value)} /></label></div><button className="button button-dark" onClick={() => addStock()}><Plus size={16} />備蓄を登録</button><div className="stock-tip"><AlertTriangle size={15} />期限30日以内のものはホームにも表示されます。</div></div><div className="panel list-panel"><div className="store-heading"><span>備蓄リスト</span><span className="count-pill">{state.stock.length}件</span></div>{state.stock.map(item => { const days = daysUntil(item.date); const danger = days < 0; const warn = days >= 0 && days <= 30; return <div className="list-row" key={item.id}><div className={`stock-dot ${danger ? "danger" : warn ? "warn" : "ok"}`} /><div className="row-main"><strong>{item.name}</strong><span className={`row-note ${danger ? "danger-text" : warn ? "warn-text" : ""}`}>{danger ? `${Math.abs(days)}日超過` : warn ? `あと${days}日` : `${item.date}まで`}</span></div><button className="icon-button danger" onClick={() => deleteStock(item.id)}><Trash2 size={15} /></button></div>})}</div></div>
      )}
    </section>
  );

  const renderTools = () => (
    <section className="page-section">
      {renderBreadcrumb()}
      <div className="page-title-row"><div><p className="eyebrow">TOOLS / ひと息つく</p><h1>ひと息ツール</h1><p className="page-lede">計算する、整える、集中する。暮らしの小さな摩擦を減らします。</p></div></div>
      <div className="tool-tabs">{([['calculator', '電卓', <Calculator size={15} />], ['pomodoro', 'ポモドーロ', <Timer size={15} />], ['weather', '天気', <CloudSun size={15} />], ['converter', '単位変換', <Ruler size={15} />], ['sound', '環境音', <Volume2 size={15} />]] as const).map(([id, label, icon]) => <button key={id} className={toolTab === id ? "active" : ""} onClick={() => setToolTab(id)}>{icon}{label}</button>)}</div>
      {toolTab === "calculator" && <div className="tool-grid"><div className="panel calculator-card"><div className="panel-heading"><div><p className="eyebrow">SMART CALCULATOR</p><h2>立替・割り勘をすぐ計算</h2></div><Calculator className="panel-icon" size={24} /></div><div className="calculator-mode-tabs"><button className={calculatorMode === "change" ? "active" : ""} onClick={() => setCalculatorMode("change")}>会計別お釣り指示</button><button className={calculatorMode === "split" ? "active" : ""} onClick={() => setCalculatorMode("split")}>通常の割り勘</button></div>{calculatorMode === "change" ? <div className="change-mode-content"><div className="change-explainer"><ArrowLeftRight size={17} /><span>会計ごとの金額と、レジで出す金額を入れると、集めたお釣りから誰がいくら取るかを指示します。</span></div><div className="change-table"><div className="change-table-head"><span>人</span><span>会計</span><span>出す金額</span><span>お釣り</span><span /></div>{changeSummary.map(row => <div className="change-row" key={row.id}><input className="payer-name" value={row.name} onChange={e => updateChangeRow(row.id, "name", e.target.value)} aria-label="支払う人" /><label><span>会計</span><input type="number" min="0" value={row.amount} onChange={e => updateChangeRow(row.id, "amount", e.target.value)} /></label><label><span>レジに出す</span><input type="number" min="0" value={row.paid} onChange={e => updateChangeRow(row.id, "paid", e.target.value)} /></label><strong className={row.change < 0 ? "change-negative" : "change-positive"}>{row.change >= 0 ? `¥${row.change.toLocaleString()}` : `あと¥${Math.abs(row.change).toLocaleString()}`}</strong><button className="icon-button danger" onClick={() => removeChangeRow(row.id)} title="行を削除"><Trash2 size={14} /></button></div>)}</div><button className="button button-ghost add-payer-button" onClick={addChangeRow}><Plus size={15} />会計を追加</button><div className="change-total-strip"><span>会計合計 <strong>¥{changeTotals.amount.toLocaleString()}</strong></span><span>レジへ <strong>¥{changeTotals.paid.toLocaleString()}</strong></span><span>お釣り合計 <strong>¥{changeTotals.change.toLocaleString()}</strong></span></div><div className="instruction-box"><div className="instruction-heading"><Check size={16} /><strong>集めたお金から取る指示</strong></div>{changeSummary.map(row => <div className="instruction-row" key={`instruction-${row.id}`}>{row.change > 0 ? <><strong>{row.name}</strong>は、集めたお金から<strong>¥{row.change.toLocaleString()}</strong>取る</> : row.change < 0 ? <><strong>{row.name}</strong>は、あと<strong>¥{Math.abs(row.change).toLocaleString()}</strong>出す</> : <><strong>{row.name}</strong>のお釣りはなし</>}</div>)}</div><button className="button button-ghost copy-instructions" onClick={() => { const text = changeSummary.map(row => row.change > 0 ? `${row.name}は集めたお金から${row.change}円取る` : row.change < 0 ? `${row.name}はあと${Math.abs(row.change)}円出す` : `${row.name}のお釣りはなし`).join("\n"); navigator.clipboard?.writeText(text); toast.success("お釣りの指示をコピーしました"); }}><Save size={15} />指示をコピー</button></div> : <div><div className="calc-display"><span>ひとりあたり</span><strong>¥{calcPerPerson.toLocaleString()}</strong><small>合計 ¥{(Number(calcTotal || 0) + Number(calcTip || 0)).toLocaleString()} / {calcPeople || 1}人</small></div><div className="form-grid three"><label>合計金額<input type="number" value={calcTotal} onChange={e => setCalcTotal(e.target.value)} /></label><label>人数<input type="number" min="1" value={calcPeople} onChange={e => setCalcPeople(e.target.value)} /></label><label>追加分<input type="number" value={calcTip} onChange={e => setCalcTip(e.target.value)} /></label></div><div className="settlement-note"><span>端数は一人あたりに含めています</span><button className="button button-ghost" onClick={() => { navigator.clipboard?.writeText(`ひとりあたり ¥${calcPerPerson.toLocaleString()}`); toast.success("結果をコピーしました"); }}><Save size={15} />コピー</button></div></div>}</div><div className="panel side-note"><span className="number-badge">01</span><h3>レジでお釣りを崩さない。</h3><p>会計ごとに多めに出した金額とお釣りを記録。まとめて返ってきたお釣りから、誰がいくら取るかをそのまま指示できます。</p><div className="location-note"><Check size={15} />例：Aは500円、Bは500円取る</div></div></div>}
      {toolTab === "pomodoro" && <div className="tool-grid"><div className="panel pomo-card"><div className="eyebrow">FOCUS TIMER</div><div className="pomo-mode"><span>{pomoMode}</span><span>/{pomoMode === "集中" ? "25分" : "5分"}</span></div><div className="timer-display">{timeLabel}</div><div className="timer-progress"><span style={{ width: `${100 - (pomoSeconds / (pomoMode === "集中" ? 25 * 60 : 5 * 60)) * 100}%` }} /></div><div className="timer-actions"><button className="button button-dark" onClick={() => setPomoRunning(!pomoRunning)}>{pomoRunning ? <Pause size={17} /> : <Play size={17} />}{pomoRunning ? "一時停止" : "開始"}</button><button className="button button-ghost" onClick={() => { setPomoRunning(false); setPomoSeconds(pomoMode === "集中" ? 25 * 60 : 5 * 60); }}><RefreshCw size={16} />リセット</button></div></div><div className="panel side-note coral-side"><span className="number-badge">02</span><h3>25分だけ、目の前のこと。</h3><p>集中と休憩を交互に。タイマーが終わったら、いったん立ち上がって深呼吸しましょう。</p><div className="mode-switch"><button className={pomoMode === "集中" ? "active" : ""} onClick={() => { setPomoMode("集中"); setPomoSeconds(25 * 60); setPomoRunning(false); }}>集中 25分</button><button className={pomoMode === "休憩" ? "active" : ""} onClick={() => { setPomoMode("休憩"); setPomoSeconds(5 * 60); setPomoRunning(false); }}>休憩 5分</button></div></div></div>}
      {toolTab === "weather" && <div className="tool-grid"><div className="panel weather-card"><div className="panel-heading"><div><p className="eyebrow">WEATHER & CLOTHES</p><h2>今日の空気に合わせる</h2></div><CloudSun className="panel-icon" size={24} /></div><div className="weather-controls"><label>地域<select value={weatherCity} onChange={e => setWeatherCity(e.target.value)}>{["東京", "大阪", "福岡", "札幌"].map(city => <option key={city}>{city}</option>)}</select></label><button className="button button-primary" onClick={fetchWeather}>{weatherLoading ? <RefreshCw className="spin" size={15} /> : <CloudSun size={15} />}{weatherLoading ? "取得中" : "天気を見る"}</button></div><div className="weather-result"><div className="weather-temp">{weather.temp}</div><div><strong>{weather.loaded ? `${weatherCity}の服装メモ` : "手動で地域を選べます"}</strong><p>{weather.label}</p></div></div><div className="weather-tips"><span><Wind size={15} />風が強い日は首元を守る</span><span><Sun size={15} />日差しがあれば帽子を</span></div></div><div className="panel side-note blue-side"><span className="number-badge">03</span><h3>出かける前の30秒チェック。</h3><p>外部APIから現在の気温を取得します。位置情報を使わず、地域を選ぶだけでも確認できます。</p><div className="location-note"><MapPin size={15} />位置情報は保存しません</div></div></div>}
      {toolTab === "converter" && <div className="tool-grid"><div className="panel converter-card"><div className="panel-heading"><div><p className="eyebrow">QUICK CONVERTER</p><h2>単位を迷わず変換</h2></div><ArrowLeftRight className="panel-icon" size={24} /></div><div className="category-pills">{[["length", "長さ"], ["weight", "重さ"], ["temperature", "温度"]].map(([id, label]) => <button key={id} className={convertCategory === id ? "active" : ""} onClick={() => setConvertCategory(id)}>{label}</button>)}</div><div className="converter-row"><input type="number" value={convertValue} onChange={e => setConvertValue(e.target.value)} /><select value={convertFrom} onChange={e => setConvertFrom(e.target.value)}>{conversionUnits.map(unit => <option key={unit}>{unit}</option>)}</select><ArrowLeftRight size={18} /><select value={convertTo} onChange={e => setConvertTo(e.target.value)}>{conversionUnits.map(unit => <option key={unit}>{unit}</option>)}</select><div className="convert-result">{convertedValue}</div></div></div><div className="panel side-note amber-side"><span className="number-badge">04</span><h3>レシピも、DIYも、すぐ確認。</h3><p>よく使う長さ・重さ・温度を、計算機を開かずに変換できます。</p></div></div>}
      {toolTab === "sound" && <div className="tool-grid"><div className="panel sound-card"><div className="sound-visual"><div className={`sound-orb ${soundOn ? "playing" : ""}`}><Volume2 size={30} /></div><div><p className="eyebrow">AMBIENT SOUND</p><h2>静かな集中をつくる</h2><p>低いトーンの環境音を小さく流します。</p></div></div><button className={`button ${soundOn ? "button-coral" : "button-dark"}`} onClick={toggleSound}>{soundOn ? <Pause size={16} /> : <Play size={16} />}{soundOn ? "停止する" : "環境音を流す"}</button></div><div className="panel side-note purple-side"><span className="number-badge">05</span><h3>音量は小さく、余白は大きく。</h3><p>音声ファイルを使わず、ブラウザのWeb Audio APIで生成しています。</p><div className="location-note"><Volume2 size={15} />端末の音量も確認してください</div></div></div>}
    </section>
  );

  const renderHome = () => {
    const slide = [
      ["まずは、今日のことだけ。", "家族ボードでは、今必要な情報をひとまとめにできます。"],
      ["決まったら、すぐ共有。", "夕飯の予定や買い物は、入力した瞬間に家族の画面へ。"],
      ["便利な道具も、ここに。", "計算や集中タイマーまで、暮らしの流れを止めずに使えます。"],
    ][tourSlide];
    return <section className="home-section"><div className="home-hero"><div className="hero-copy"><div className="date-stamp"><CalendarDays size={15} />{formatDate()}</div><h1>今日の家族会議を、<br /><em>30秒で。</em></h1><p>{state.message}</p><div className="hero-actions"><button className="button button-primary" onClick={() => setModal("quick")}><Plus size={16} />クイック追加</button><button className="text-button" onClick={() => changeView("family")}>家族ボードを見る <ChevronRight size={15} /></button></div></div><div className="hero-aside"><div className="sync-card"><div className="sync-dot" /><div><span>共有ステータス</span><strong>{syncText}</strong></div><button className="icon-button" onClick={() => cloudState.refetch()} title="再同期"><RefreshCw size={15} /></button></div>{!tourDismissed && <div className="tour-card"><div className="tour-top"><span className="eyebrow">FIRST LOOK / 0{tourSlide + 1}</span><button className="icon-button" onClick={dismissTour}><X size={15} /></button></div><h3>{slide[0]}</h3><p>{slide[1]}</p><div className="tour-controls"><div className="tour-dots">{[0, 1, 2].map(index => <button key={index} className={index === tourSlide ? "active" : ""} onClick={() => setTourSlide(index)} aria-label={`${index + 1}枚目`} />)}</div><button onClick={() => tourSlide === 2 ? dismissTour() : setTourSlide(tourSlide + 1)}>{tourSlide === 2 ? "はじめる" : "次へ"}<ChevronRight size={14} /></button></div></div>}</div></div><div className="summary-grid"><SummaryCard icon={<ShoppingBasket size={19} />} label="買い物" value={`${remainingShopping.length}件`} detail={remainingShopping[0]?.item ? `次は ${remainingShopping[0].item}` : "すべて完了"} color="teal" onClick={() => { setBoardTab("shopping"); navigate("family"); }} /><SummaryCard icon={<Utensils size={19} />} label="夕飯" value={`${statusSummary}/${familyMembers.length}人`} detail={state.dinner.menu || "メニュー未定"} color="coral" onClick={() => { setBoardTab("dinner"); navigate("family"); }} /><SummaryCard icon={<ClipboardCheck size={19} />} label="伝言" value={`${remainingTodos.length}件`} detail={remainingTodos[0]?.text || "伝言はありません"} color="purple" onClick={() => { setBoardTab("messages"); navigate("family"); }} /><SummaryCard icon={<ShieldCheck size={19} />} label="防災" value={`${stockAlerts.length}件注意`} detail={stockAlerts[0]?.name || "期限は余裕あり"} color="amber" onClick={() => { setBoardTab("stock"); navigate("family"); }} /></div><div className="home-columns"><div className="panel next-panel"><div className="section-heading"><div><p className="eyebrow">NEXT UP</p><h2>今日の小さなチェック</h2></div><MoreHorizontal size={19} /></div><div className="next-list"><button onClick={() => { setBoardTab("shopping"); navigate("family"); }}><span className="next-icon teal"><ShoppingBasket size={17} /></span><span><strong>買い物</strong><small>{remainingShopping.length ? `${remainingShopping.length}件を確認` : "完了"}</small></span><ChevronRight size={16} /></button><button onClick={() => { setBoardTab("trash"); navigate("family"); }}><span className="next-icon blue"><Trash2 size={17} /></span><span><strong>ゴミ出し</strong><small>{state.trash[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]?.type || "予定を確認"}</small></span><ChevronRight size={16} /></button><button onClick={() => { setBoardTab("dinner"); navigate("family"); }}><span className="next-icon coral"><Utensils size={17} /></span><span><strong>夕飯</strong><small>{state.dinner.menu || "メニューを決める"}</small></span><ChevronRight size={16} /></button></div></div><div className="panel quote-panel"><div className="quote-mark">“</div><p>家事は見えないと増える。<br />見えると、分けられる。</p><span>かぞくハブの考え方</span><div className="quote-line" /></div></div><div className="home-footer-note"><Sparkles size={16} /><span>今日も一つ、共有できたら十分です。</span><button className="text-button" onClick={() => changeView("tools")}>ひと息ツールへ <ChevronRight size={15} /></button></div></section>;
  };

  const renderSettings = () => <section className="page-section settings-page">{renderBreadcrumb()}<div className="page-title-row"><div><p className="eyebrow">SETTINGS / 家族をつなぐ</p><h1>設定</h1><p className="page-lede">アカウントと家族グループを、わが家の使い方に合わせます。</p></div></div><div className="settings-grid"><div className="panel"><div className="section-heading"><div><p className="eyebrow">ACCOUNT</p><h3>あなたのアカウント</h3></div><Home size={19} /></div><div className="account-card"><span className="account-avatar">{(currentMemberName || "家").slice(0, 1)}</span><div><strong>{currentMemberName}</strong><small>{auth.user?.email || "Manusアカウントでログイン中"}</small></div></div><button className="button button-ghost account-logout" onClick={() => void auth.logout().catch(error => toast.error(error instanceof Error ? error.message : "ログアウトできませんでした"))}>この端末からログアウト</button></div><div className="panel"><div className="section-heading"><div><p className="eyebrow">FAMILY GROUP</p><h3>共有する家族</h3></div><Users size={19} /></div><label className="large-label">表示する家族<select value={selectedGroup.groupId} onChange={e => { const nextId = Number(e.target.value); setActiveGroupId(nextId); localStorage.setItem(ACTIVE_GROUP_KEY, String(nextId)); }}><>{(groupsQuery.data as FamilyGroup[]).map(group => <option key={group.groupId} value={group.groupId}>{group.groupName}</option>)}</></select></label><div className="group-code-box"><div><span>家族への参加コード</span><strong>{selectedGroup.inviteCode}</strong></div><button className="button button-ghost" onClick={() => { navigator.clipboard?.writeText(selectedGroup.inviteCode); toast.success("参加コードをコピーしました"); }}><Save size={15} />コピー</button></div><p className="form-hint">家族の端末でログイン後、このコードを入力すると同じ共有スペースへ参加できます。</p></div><div className="panel"><div className="section-heading"><div><p className="eyebrow">YOUR PROFILE</p><h3>あなたの表示名</h3></div><Utensils size={19} /></div><label className="large-label">家族ボードで表示する名前<input value={profileDraft} onChange={e => setProfileDraft(e.target.value)} onBlur={saveProfileName} placeholder="例：お母さん" /></label><p className="form-hint">表示名はあなたのアカウントにだけ紐づきます。変更後も夕飯の回答履歴は引き継がれます。</p><div className="member-name-list">{familyMemberRecords.map(member => <div className="member-name-row readonly" key={member.openId}><span className="member-avatar">{(member.displayName || "家").slice(0, 1)}</span><span><strong>{member.displayName}</strong>{member.openId === auth.user?.openId && <small>あなた</small>}</span><span className="member-role">{member.role === "owner" ? "管理者" : "メンバー"}</span></div>)}</div></div><div className="panel"><div className="section-heading"><div><p className="eyebrow">APPEARANCE</p><h3>見た目と保存</h3></div><SlidersHorizontalIcon /></div><div className="setting-row"><div><strong>表示テーマ</strong><small>夜は目にやさしい色へ</small></div><button className="theme-choice" onClick={toggleTheme}>{theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}{theme === "dark" ? "ダーク" : "ライト"}</button></div><div className="setting-row"><div><strong>データ同期</strong><small>{syncText}</small></div><span className="sync-badge"><span className="sync-dot" />家族ごとに自動保存</span></div><div className="setting-row danger-setting"><div><strong>この家族のデータを初期化</strong><small>共有中のメモ・予定・備蓄がサンプルデータに戻ります</small></div><button className="button button-danger" onClick={() => setModal("reset")}><RefreshCw size={15} />初期化</button></div></div></div><div className="settings-footnote"><CircleHelp size={16} /><span>家族の端末ごとに自分のアカウントでログインしてください。共有データは選択中の家族グループにだけ保存されます。</span></div></section>;

  if (auth.loading) return <AuthLoading text="アカウントを確認しています…" />;
  if (!auth.isAuthenticated) return <AuthScreen onLogin={() => startLogin()} />;
  if (groupsQuery.isLoading) return <AuthLoading text="家族グループを読み込んでいます…" />;
  if (groupsQuery.isError) return <AuthScreen title="家族グループを読み込めません" description="通信状態を確認して、もう一度お試しください。" onLogin={() => groupsQuery.refetch()} actionLabel="再読み込み" />;
  if (!groupsQuery.data?.length) return <FamilySetup accountName={auth.user?.name ?? ""} onComplete={groupId => { setActiveGroupId(groupId); localStorage.setItem(ACTIVE_GROUP_KEY, String(groupId)); void groupsQuery.refetch(); }} />;
  if (!activeGroup) return <AuthLoading text="選択中の家族を切り替えています…" />;

  const selectedGroup = activeGroup;

  const currentTitle = view === "home" ? "今日" : view === "family" ? "家族ボード" : view === "tools" ? "ひと息ツール" : "設定";

  return <div className="app-frame"><div className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`} onClick={() => setSidebarOpen(false)} /><aside className={`sidebar ${sidebarOpen ? "open" : ""}`}><div className="brand-block"><div className="brand-mark"><Home size={18} /></div><div><strong>かぞくハブ</strong><span>everyday, together</span></div><button className="mobile-close icon-button" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div><div className="household-chip"><div className="avatar-stack">{familyMembers.slice(0, 3).map((member, index) => <span key={`${member}-${index}`}>{(member || "家").slice(0, 1)}</span>)}</div><div><strong>{selectedGroup.groupName}</strong><small>{familyMembers.length}人のメンバー</small></div><button className="icon-button"><MoreHorizontal size={16} /></button></div><nav className="main-nav"><span className="nav-label">MENU</span>{navItems.map(item => <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => changeView(item.id)}>{item.icon}<span><strong>{item.label}</strong><small>{item.note}</small></span>{view === item.id && <span className="nav-active-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="mini-tip"><Sparkles size={15} /><span>今日のヒント<small>完璧より、共有。</small></span></div><button className="sidebar-help"><CircleHelp size={15} />使い方を見る</button><div className="sidebar-meta"><span>SYNC STATUS</span><strong><span className="sync-dot" />{syncText}</strong></div></div></aside><main className="main-area"><header className="topbar"><button className="mobile-menu icon-button" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="topbar-context"><span className="topbar-kicker">{currentTitle.toUpperCase()}</span><span className="topbar-divider">/</span><span>{formatDate()}</span></div><div className="topbar-actions"><button className="icon-button search-button" onClick={() => { setModal("quick"); setQuickType("message"); }} title="クイック追加"><Search size={18} /></button><button className="icon-button" onClick={() => toast("新しい通知はありません")} title="通知"><Bell size={18} /></button><button className="theme-top-button" onClick={toggleTheme}>{theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}<span>{theme === "dark" ? "夜" : "昼"}</span></button></div></header><div className="content-wrap">{view === "home" && renderHome()}{view === "family" && renderFamily()}{view === "tools" && renderTools()}{view === "settings" && renderSettings()}</div></main>{modal === "quick" && <Modal title="クイック追加" subtitle="思いついた瞬間に、家族の共有スペースへ。" onClose={() => setModal(null)}><label className="modal-select">追加するもの<select value={quickType} onChange={e => setQuickType(e.target.value as QuickType)}><option value="shopping">買い物</option><option value="message">伝言</option><option value="dinner">夕飯リクエスト</option><option value="stock">防災備蓄</option></select></label>{quickType === "shopping" && <div className="modal-fields"><label>店名<input value={shoppingDraft.store} onChange={e => setShoppingDraft({ ...shoppingDraft, store: e.target.value })} /></label><label>買うもの<input autoFocus value={shoppingDraft.item} onChange={e => setShoppingDraft({ ...shoppingDraft, item: e.target.value })} placeholder="例：ヨーグルト" /></label><label>特売日メモ<input value={shoppingDraft.sale} onChange={e => setShoppingDraft({ ...shoppingDraft, sale: e.target.value })} placeholder="任意" /></label></div>}{quickType === "message" && <label>伝言<input autoFocus value={messageDraft} onChange={e => setMessageDraft(e.target.value)} placeholder="例：宅配便が届いたら冷蔵庫へ" /></label>}{quickType === "dinner" && <label>食べたいもの<input autoFocus value={requestDraft} onChange={e => setRequestDraft(e.target.value)} placeholder="例：カレーが食べたい" /></label>}{quickType === "stock" && <div className="modal-fields"><label>品名<input autoFocus value={stockDraft.name} onChange={e => setStockDraft({ ...stockDraft, name: e.target.value })} placeholder="保存水 2L" /></label><label>賞味期限<input type="date" value={stockDraft.date} onChange={e => setStockDraft({ ...stockDraft, date: e.target.value })} /></label></div>}<div className="modal-actions"><button className="button button-ghost" onClick={() => setModal(null)}>キャンセル</button><button className="button button-primary" onClick={addQuickItem}><Plus size={16} />追加する</button></div></Modal>}{modal === "reset" && <Modal title="データを初期化しますか？" subtitle="現在の家族メモ・予定・備蓄がサンプルデータに戻ります。" onClose={() => setModal(null)}><div className="warning-box"><AlertTriangle size={20} /><span>この操作は元に戻せません。必要なメモがある場合は先に控えてください。</span></div><div className="modal-actions"><button className="button button-ghost" onClick={() => setModal(null)}>やめる</button><button className="button button-danger" onClick={resetAll}><RefreshCw size={16} />初期化する</button></div></Modal>}<Toaster position="bottom-right" richColors /></div>;
}

function AuthLoading({ text }: { text: string }) {
  return <div className="auth-screen"><div className="auth-card loading-card"><div className="brand-mark"><Home size={19} /></div><span className="eyebrow">KAZOKU HUB</span><h1>{text}</h1><div className="loading-bar" /></div></div>;
}

function AuthScreen({ title = "家族で使うにはログイン", description = "家族それぞれのアカウントでログインすると、夕飯の回答や共有メモを自分の端末から更新できます。", actionLabel = "Manusでログイン", onLogin }: { title?: string; description?: string; actionLabel?: string; onLogin: () => void | Promise<unknown> }) {
  return <div className="auth-screen"><div className="auth-card"><div className="auth-illustration"><div className="brand-mark"><Home size={22} /></div><span className="auth-orbit orbit-one" /><span className="auth-orbit orbit-two" /></div><p className="eyebrow">KAZOKU HUB / FAMILY SPACE</p><h1>{title}</h1><p className="auth-description">{description}</p><button className="button button-primary auth-button" onClick={() => void onLogin()}>{actionLabel}<ChevronRight size={16} /></button><p className="auth-note">ログイン後、家族グループを作成するか、招待コードで参加できます。</p></div></div>;
}

function FamilySetup({ accountName, onComplete }: { accountName: string; onComplete: (groupId: number) => void }) {
  const [mode, setMode] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("わが家");
  const [displayName, setDisplayName] = useState(accountName);
  const [inviteCode, setInviteCode] = useState("");
  const createMutation = trpc.family.create.useMutation();
  const joinMutation = trpc.family.join.useMutation();
  const pending = createMutation.isPending || joinMutation.isPending;

  const submit = () => {
    if (!displayName.trim()) return toast.error("あなたの表示名を入力してください");
    if (mode === "create") {
      if (!familyName.trim()) return toast.error("家族名を入力してください");
      createMutation.mutate({ name: familyName, displayName }, { onSuccess: result => { toast.success("家族グループを作成しました"); onComplete(result.groupId); }, onError: error => toast.error(error.message) });
    } else {
      if (!inviteCode.trim()) return toast.error("招待コードを入力してください");
      joinMutation.mutate({ inviteCode, displayName }, { onSuccess: result => { toast.success("家族グループに参加しました"); onComplete(result.groupId); }, onError: error => toast.error(error.message) });
    }
  };

  return <div className="auth-screen"><div className="auth-card setup-card"><div className="auth-illustration compact"><div className="brand-mark"><Users size={22} /></div></div><p className="eyebrow">ONE FAMILY, MANY DEVICES</p><h1>家族の共有スペースを作る</h1><p className="auth-description">この端末のアカウントを家族グループへつなぎます。作成者は、表示された参加コードを家族に共有してください。</p><div className="setup-mode"><button className={mode === "create" ? "active" : ""} onClick={() => setMode("create")}>新しく作る</button><button className={mode === "join" ? "active" : ""} onClick={() => setMode("join")}>招待コードで参加</button></div><div className="setup-fields"><label>あなたの表示名<input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="例：お母さん" /></label>{mode === "create" ? <label>家族グループ名<input value={familyName} onChange={e => setFamilyName(e.target.value)} placeholder="例：わが家" /></label> : <label>招待コード<input value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())} placeholder="例：A1B2C3D4" maxLength={12} /></label>}</div><button className="button button-primary auth-button" onClick={submit} disabled={pending}>{pending ? "準備しています…" : mode === "create" ? "家族グループを作成" : "家族に参加する"}<ChevronRight size={16} /></button><p className="auth-note">あとから設定画面で、表示名の変更や別の家族グループへの切り替えができます。</p></div></div>;
}

function CircleCheck() {
  return <span className="circle-check"><Check size={13} /></span>;
}

function SlidersHorizontalIcon() {
  return <span className="sliders-icon"><MoreHorizontal size={19} /></span>;
}

function SummaryCard({ icon, label, value, detail, color, onClick }: { icon: React.ReactNode; label: string; value: string; detail: string; color: string; onClick: () => void }) {
  return <button className={`summary-card ${color}`} onClick={onClick}><span className="summary-icon">{icon}</span><span className="summary-label">{label}</span><strong>{value}</strong><small>{detail}</small><ChevronRight size={15} className="summary-arrow" /></button>;
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{text}</p></div>;
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal-card" onMouseDown={e => e.stopPropagation()}><div className="modal-header"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose}><X size={18} /></button></div><div className="modal-body">{children}</div></div></div>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light" switchable><TooltipProvider><AppShell /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
