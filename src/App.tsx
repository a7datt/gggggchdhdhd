import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Image as ImageIcon,
  LayoutGrid,
  Pencil,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';

export type Category = {
  id: number;
  name: string;
  image_url?: string;
  [key: string]: any;
};

export type Product = {
  id: number;
  name: string;
  price: number;
  params?: string[];
  category_name?: string;
  available?: boolean;
  qty_values?: { min?: number; max?: number };
  product_type?: string;
  parent_id?: number;
  image_url?: string;
  [key: string]: any;
};

export type Profile = {
  status?: string;
  balance?: string | number;
  email?: string;
};

type ContentResponse = {
  status?: string;
  categories?: Category[];
  products?: Product[];
};

type OrderRecord = {
  orderId: string;
  uuid: string;
  productId: number;
  productName: string;
  status: string;
  price: number;
  createdAt: string;
  params: Record<string, string>;
};

type CustomEntry = { image: string; margin: number };
type CustomStore = { categories: Record<string, CustomEntry>; products: Record<string, CustomEntry> };

type ModalState =
  | { kind: 'order'; product: Product }
  | { kind: 'custom'; targetType: 'category' | 'product'; targetId: number; title: string; current: CustomEntry }
  | null;

const STORAGE_KEY_ORDERS = 'ahminix.orders.v1';
const STORAGE_KEY_CUSTOM = 'ahminix.custom.v1';

const emptyCustomStore: CustomStore = { categories: {}, products: {} };

function useLocalStorageState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  }, [key, value]);

  return [value, setValue] as const;
}

function formatUsd(value: number) {
  return `$${Number.isFinite(value) ? value.toFixed(2) : '0.00'}`;
}

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function deriveParamKey(label: string, index: number) {
  const n = normalizeText(label);
  if (n.includes('player') && n.includes('id')) return 'playerId';
  if (n.includes('player')) return 'playerId';
  if (n.includes('id')) return 'playerId';
  if (n.includes('uuid')) return 'uuid';
  if (n.includes('phone')) return 'phone';
  if (n.includes('email')) return 'email';
  return `param_${index + 1}`;
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const text = await res.text();
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : payload?.message || payload?.error || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return payload as T;
}

function CardShell({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-slate-200 bg-white shadow-[0_16px_40px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-4 backdrop-blur-sm md:items-center">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl rounded-[2rem] bg-white p-4 shadow-2xl md:p-6">{children}</div>
    </div>
  );
}

function ErrorBoundaryView({ error }: { error: Error }) {
  return (
    <div className="min-h-screen bg-slate-50 p-6 text-slate-900">
      <div className="mx-auto max-w-3xl rounded-3xl border border-red-100 bg-white p-6 shadow-sm">
        <div className="mb-3 flex items-center gap-3 text-red-600">
          <X />
          <h1 className="text-xl font-bold">حدث خطأ</h1>
        </div>
        <pre className="whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">{error.message}</pre>
      </div>
    </div>
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) return <ErrorBoundaryView error={this.state.error} />;
    return this.props.children;
  }
}

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rootCategories, setRootCategories] = useState<Category[]>([]);
  const [rootProducts, setRootProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [activeCategories, setActiveCategories] = useState<Category[]>([]);
  const [activeProducts, setActiveProducts] = useState<Product[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [error, setError] = useState<string>('');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'shop' | 'orders' | 'settings'>('shop');
  const [modal, setModal] = useState<ModalState>(null);
  const [orders, setOrders] = useLocalStorageState<OrderRecord[]>(STORAGE_KEY_ORDERS, []);
  const [customStore, setCustomStore] = useLocalStorageState<CustomStore>(STORAGE_KEY_CUSTOM, emptyCustomStore);
  const [orderQty, setOrderQty] = useState('1');
  const [orderValues, setOrderValues] = useState<Record<string, string>>({});
  const [customImage, setCustomImage] = useState('');
  const [customMargin, setCustomMargin] = useState('0');

  const loadProfile = async () => {
    setLoadingProfile(true);
    try {
      const data = await apiJson<Profile>('/api/ahminix/profile');
      setProfile(data);
    } catch (err: any) {
      setError(err.message || 'فشل تحميل الحساب');
    } finally {
      setLoadingProfile(false);
    }
  };

  const loadCatalog = async (categoryId: number | null = null) => {
    setLoadingCatalog(true);
    setError('');
    try {
      const endpoint = categoryId === null ? '/api/ahminix/content/0' : `/api/ahminix/content/${categoryId}`;
      const data = await apiJson<ContentResponse>(endpoint);
      const categories = Array.isArray(data.categories) ? data.categories : [];
      const products = Array.isArray(data.products) ? data.products : [];

      if (categoryId === null) {
        setRootCategories(categories);
        setRootProducts(products);
        setActiveCategories(categories);
        setActiveProducts(products);
      } else {
        setActiveCategories(categories.length ? categories : rootCategories.filter((c) => c.id === categoryId));
        setActiveProducts(products);
      }
      setActiveCategoryId(categoryId);
    } catch (err: any) {
      setError(err.message || 'فشل تحميل المنتجات');
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    void loadProfile();
    void loadCatalog(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredRootProducts = useMemo(() => {
    const q = normalizeText(query);
    return rootProducts.filter((p) => {
      const haystack = [p.name, p.category_name, String(p.id)].filter(Boolean).join(' ');
      return !q || normalizeText(haystack).includes(q);
    });
  }, [query, rootProducts]);

  const filteredActiveProducts = useMemo(() => {
    const q = normalizeText(query);
    return activeProducts.filter((p) => {
      const haystack = [p.name, p.category_name, String(p.id)].filter(Boolean).join(' ');
      return !q || normalizeText(haystack).includes(q);
    });
  }, [query, activeProducts]);

  const displayGroups = useMemo(() => {
    const sourceCategories = activeCategoryId === null ? rootCategories : activeCategories;
    const sourceProducts = activeCategoryId === null ? filteredRootProducts : filteredActiveProducts;

    if (activeCategoryId !== null) {
      const activeCategory = sourceCategories.find((c) => c.id === activeCategoryId) || sourceCategories[0] || null;
      return [
        {
          category: activeCategory,
          products: sourceProducts,
        },
      ];
    }

    const grouped = sourceCategories
      .map((category) => ({
        category,
        products: sourceProducts.filter(
          (product) => product.category_name === category.name || product.parent_id === category.id,
        ),
      }))
      .filter((group) => group.products.length > 0);

    const usedIds = new Set(grouped.flatMap((group) => group.products.map((p) => p.id)));
    const ungrouped = sourceProducts.filter((product) => !usedIds.has(product.id));

    if (ungrouped.length) {
      grouped.push({ category: null, products: ungrouped });
    }

    return grouped;
  }, [activeCategoryId, activeCategories, activeProducts, filteredActiveProducts, filteredRootProducts, rootCategories]);

  const openOrderModal = (product: Product) => {
    setOrderValues({});
    setOrderQty(String(Math.max(1, toNumber(product.qty_values?.min, 1))));
    setModal({ kind: 'order', product });
  };

  const openCustomization = (targetType: 'category' | 'product', targetId: number, title: string) => {
    const current =
      targetType === 'category'
        ? customStore.categories[String(targetId)] || { image: '', margin: 0 }
        : customStore.products[String(targetId)] || { image: '', margin: 0 };
    setCustomImage(current.image || '');
    setCustomMargin(String(current.margin ?? 0));
    setModal({ kind: 'custom', targetType, targetId, title, current });
  };

  const saveCustomization = () => {
    if (!modal || modal.kind !== 'custom') return;
    const entry: CustomEntry = {
      image: customImage.trim(),
      margin: Math.max(0, Number(customMargin) || 0),
    };

    setCustomStore((prev) => {
      const next = {
        categories: { ...prev.categories },
        products: { ...prev.products },
      } as CustomStore;
      if (modal.targetType === 'category') next.categories[String(modal.targetId)] = entry;
      else next.products[String(modal.targetId)] = entry;
      return next;
    });
    setModal(null);
  };

  const submitOrder = async () => {
    if (!modal || modal.kind !== 'order') return;
    const product = modal.product;
    const payload: Record<string, string | number> = {
      qty: Math.max(1, Math.floor(Number(orderQty) || 1)),
      order_uuid: crypto.randomUUID(),
    };

    (product.params || []).forEach((label, index) => {
      const key = deriveParamKey(label, index);
      const value = orderValues[key]?.trim();
      if (value) payload[key] = value;
    });

    Object.entries(orderValues).forEach(([key, value]) => {
      const v = value.trim();
      if (v && !(key in payload)) payload[key] = v;
    });

    try {
      const endpoint = product.params?.length
        ? `/api/ahminix/newOrder/${product.id}/params`
        : `/api/ahminix/newOrder/${product.id}`;
      const data = await apiJson<any>(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = data?.data || data || {};
      const orderId = String(result.order_id || result.id || payload.order_uuid);
      const newRecord: OrderRecord = {
        orderId,
        uuid: String(payload.order_uuid),
        productId: product.id,
        productName: product.name,
        status: String(result.status || 'processing'),
        price: toNumber(result.price, toNumber(product.price) * toNumber(payload.qty, 1)),
        createdAt: result.created_at || new Date().toISOString(),
        params: Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'qty' && key !== 'order_uuid')) as Record<string, string>,
      };
      setOrders((prev) => [newRecord, ...prev.filter((item) => item.orderId !== newRecord.orderId)]);
      setModal(null);
      setTab('orders');
    } catch (err: any) {
      alert(err.message || 'فشل إنشاء الطلب');
    }
  };

  const refreshOrderStatuses = async () => {
    if (!orders.length) return;
    setLoadingOrders(true);
    try {
      const ids = orders.map((item) => item.orderId);
      const response = await apiJson<any>(`/api/ahminix/check?orders=[${ids.join(',')}]`);
      const rows: any[] = Array.isArray(response?.data) ? response.data : [];
      const byId = new Map(rows.map((row) => [String(row.order_id), row]));
      setOrders((prev) =>
        prev.map((item) => {
          const row = byId.get(item.orderId);
          if (!row) return item;
          return {
            ...item,
            status: String(row.status || item.status),
            price: toNumber(row.price, item.price),
          };
        }),
      );
    } catch (err: any) {
      alert(err.message || 'فشل تحديث الطلبات');
    } finally {
      setLoadingOrders(false);
    }
  };

  const activeCategoryTitle =
    activeCategoryId === null
      ? 'الكل'
      : (activeCategories.find((c) => c.id === activeCategoryId)?.name || rootCategories.find((c) => c.id === activeCategoryId)?.name || '');

  const profileBalance = profile?.balance !== undefined ? toNumber(profile.balance, 0) : 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-6">
        <header className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)] md:flex-row md:items-center md:justify-between md:p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-300/50">
              <Star size={24} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Dashboard</div>
              <h1 className="text-2xl font-black">لوحة التحكم</h1>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Wallet size={16} />
                <span>{loadingProfile ? '...' : profile?.email || ''}</span>
              </div>
              <div className="mt-1 text-2xl font-black text-slate-900">{formatUsd(profileBalance)}</div>
            </div>
            <button
              onClick={() => {
                void loadProfile();
                void loadCatalog(activeCategoryId);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white transition hover:bg-slate-800"
            >
              <RefreshCw size={16} />
              تحديث
            </button>
          </div>
        </header>

        <nav className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {[
            { id: 'shop', label: 'الرئيسية', icon: LayoutGrid },
            { id: 'orders', label: 'الطلبات', icon: ShoppingCart },
            { id: 'settings', label: 'الإعدادات', icon: Settings },
          ].map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setTab(item.id as any)}
                className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                  active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>

        {error ? (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {tab === 'shop' && (
          <div className="space-y-4">
            <CardShell className="p-3 md:p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 overflow-x-auto pb-1">
                  <button
                    onClick={() => void loadCatalog(null)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                      activeCategoryId === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    الكل
                  </button>
                  {(rootCategories.length ? rootCategories : activeCategories).map((category) => {
                    const custom = customStore.categories[String(category.id)];
                    const active = activeCategoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        onClick={() => void loadCatalog(category.id)}
                        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition ${
                          active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-xl bg-white/20">
                          {custom?.image ? (
                            <img src={custom.image} alt={category.name} className="h-full w-full object-cover" />
                          ) : category.image_url ? (
                            <img src={category.image_url} alt={category.name} className="h-full w-full object-cover" />
                          ) : (
                            <ImageIcon size={14} />
                          )}
                        </span>
                        {category.name}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomization('category', category.id, category.name);
                          }}
                          className={`rounded-full p-1 ${active ? 'bg-white/15' : 'bg-white text-slate-400'}`}
                          aria-label="تخصيص القسم"
                        >
                          <Pencil size={12} />
                        </button>
                      </button>
                    );
                  })}
                </div>

                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:w-[360px]">
                  <Search size={16} className="text-slate-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                    placeholder="بحث"
                  />
                </label>
              </div>
            </CardShell>

            {loadingCatalog ? (
              <CardShell className="p-8 text-center text-slate-500">جاري الجلب…</CardShell>
            ) : (
              <div className="space-y-6">
                {displayGroups.map((group, groupIndex) => {
                  const category = group.category;
                  const categoryCustom = category ? customStore.categories[String(category.id)] : null;
                  const title = category?.name || 'المنتجات';
                  const image = categoryCustom?.image || category?.image_url || '';
                  const margin = categoryCustom?.margin ?? 0;

                  return (
                    <section key={`${category?.id ?? 'all'}-${groupIndex}`} className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-slate-900 text-white">
                            {image ? <img src={image} alt={title} className="h-full w-full object-cover" /> : <LayoutGrid size={20} />}
                          </div>
                          <div>
                            <div className="text-lg font-black">{title}</div>
                            <div className="text-xs text-slate-400">
                              {group.products.length} منتج{margin ? ` • +${margin}%` : ''}
                            </div>
                          </div>
                        </div>
                        {category ? (
                          <button
                            onClick={() => openCustomization('category', category.id, category.name)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600"
                          >
                            <SlidersHorizontal size={15} />
                            ضبط
                          </button>
                        ) : null}
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {group.products.map((product) => {
                          const custom = customStore.products[String(product.id)];
                          const effectiveMargin = custom?.margin ?? margin;
                          const displayPrice = toNumber(product.price, 0) * (1 + effectiveMargin / 100);
                          const displayImage = custom?.image || product.image_url || '';
                          const minQty = product.qty_values?.min ?? 1;
                          const maxQty = product.qty_values?.max ?? null;
                          return (
                            <CardShell key={product.id} className="overflow-hidden">
                              <div className="relative h-40 bg-gradient-to-br from-slate-100 to-slate-200">
                                {displayImage ? (
                                  <img src={displayImage} alt={product.name} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-slate-400">
                                    <ImageIcon size={42} />
                                  </div>
                                )}
                                <button
                                  onClick={() => openCustomization('product', product.id, product.name)}
                                  className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-slate-700 shadow"
                                  aria-label="تخصيص المنتج"
                                >
                                  <Pencil size={14} />
                                </button>
                              </div>

                              <div className="space-y-3 p-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <h3 className="line-clamp-1 text-lg font-black">{product.name}</h3>
                                    <div className="text-xs text-slate-400">#{product.id}{product.category_name ? ` • ${product.category_name}` : ''}</div>
                                  </div>
                                  <div className="text-left">
                                    <div className="text-sm text-slate-400 line-through">{formatUsd(toNumber(product.price, 0))}</div>
                                    <div className="text-xl font-black">{formatUsd(displayPrice)}</div>
                                  </div>
                                </div>

                                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                                  <span className="rounded-full bg-slate-100 px-3 py-1">الحد الأدنى {minQty}</span>
                                  {maxQty ? <span className="rounded-full bg-slate-100 px-3 py-1">الحد الأعلى {maxQty}</span> : null}
                                  <span className={`rounded-full px-3 py-1 ${product.available ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                    {product.available ? 'متاح' : 'غير متاح'}
                                  </span>
                                </div>

                                <div className="flex gap-2">
                                  <button
                                    onClick={() => openOrderModal(product)}
                                    className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                                    disabled={product.available === false}
                                  >
                                    طلب
                                  </button>
                                  <button
                                    onClick={() => openCustomization('product', product.id, product.name)}
                                    className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
                                  >
                                    ضبط
                                  </button>
                                </div>
                              </div>
                            </CardShell>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}

                {!displayGroups.length ? (
                  <CardShell className="p-8 text-center text-slate-500">لا توجد نتائج</CardShell>
                ) : null}
              </div>
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-4">
            <CardShell className="p-4 md:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-lg font-black">الطلبات</div>
                  <div className="text-sm text-slate-400">{orders.length} طلب</div>
                </div>
                <button
                  onClick={() => void refreshOrderStatuses()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white transition hover:bg-slate-800 disabled:opacity-50"
                  disabled={loadingOrders}
                >
                  <RefreshCw size={16} className={loadingOrders ? 'animate-spin' : ''} />
                  تحديث الحالة
                </button>
              </div>
            </CardShell>

            <div className="space-y-3">
              {orders.map((order) => (
                <CardShell key={order.orderId} className="p-4 md:p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-black">{order.productName}</h3>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{order.orderId}</span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-sm text-slate-400">
                        <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {order.createdAt}</span>
                        <span className="inline-flex items-center gap-1"><Wallet size={14} /> {formatUsd(order.price)}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${order.status === 'accept' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                          <CheckCircle2 size={12} /> {order.status}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setOrders((prev) => prev.filter((item) => item.orderId !== order.orderId))
                      }
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500"
                    >
                      <Trash2 size={15} />
                      حذف
                    </button>
                  </div>
                </CardShell>
              ))}

              {!orders.length ? <CardShell className="p-8 text-center text-slate-500">لا توجد طلبات</CardShell> : null}
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-4">
            <CardShell className="p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-900 text-white">
                  <Settings size={22} />
                </div>
                <div>
                  <div className="text-lg font-black">الإعدادات</div>
                  <div className="text-sm text-slate-400">تحكم محلي بالعرض فقط</div>
                </div>
              </div>
            </CardShell>

            <div className="grid gap-4 md:grid-cols-2">
              <CardShell className="p-5">
                <div className="mb-4 text-base font-black">تخصيصات الأقسام</div>
                <div className="space-y-2">
                  {rootCategories.map((category) => {
                    const custom = customStore.categories[String(category.id)];
                    return (
                      <div key={category.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                        <div>
                          <div className="font-bold">{category.name}</div>
                          <div className="text-xs text-slate-400">{custom?.margin ? `+${custom.margin}%` : '0%'}</div>
                        </div>
                        <button
                          onClick={() => openCustomization('category', category.id, category.name)}
                          className="rounded-2xl bg-slate-100 px-3 py-2 text-sm font-bold"
                        >
                          ضبط
                        </button>
                      </div>
                    );
                  })}
                </div>
              </CardShell>

              <CardShell className="p-5">
                <div className="mb-4 text-base font-black">إدارة محلية</div>
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setCustomStore(emptyCustomStore);
                      setOrders([]);
                    }}
                    className="w-full rounded-2xl bg-rose-600 px-4 py-3 font-bold text-white"
                  >
                    مسح التخصيصات والطلبات المحلية
                  </button>
                  <button
                    onClick={() => {
                      setQuery('');
                      setActiveCategoryId(null);
                      void loadCatalog(null);
                    }}
                    className="w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700"
                  >
                    إعادة تحميل الكتالوج
                  </button>
                </div>
              </CardShell>
            </div>
          </div>
        )}
      </div>

      {modal?.kind === 'order' ? (
        <Modal onClose={() => setModal(null)}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Order</div>
              <h2 className="text-2xl font-black">{modal.product.name}</h2>
            </div>
            <button onClick={() => setModal(null)} className="rounded-full bg-slate-100 p-2 text-slate-500">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 md:grid-cols-[120px_1fr] md:items-start">
              <div className="h-28 overflow-hidden rounded-2xl bg-slate-100">
                {modal.product.image_url ? <img src={modal.product.image_url} alt={modal.product.name} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-400"><ImageIcon size={32} /></div>}
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-sm font-bold text-slate-500">الكمية</span>
                    <input
                      value={orderQty}
                      onChange={(e) => setOrderQty(e.target.value)}
                      type="number"
                      min={modal.product.qty_values?.min ?? 1}
                      max={modal.product.qty_values?.max ?? undefined}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                    />
                  </label>
                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-sm font-bold text-slate-500">السعر</div>
                    <div className="text-xl font-black">{formatUsd(toNumber(modal.product.price, 0))}</div>
                  </div>
                </div>

                {(modal.product.params || []).map((label, index) => {
                  const key = deriveParamKey(label, index);
                  return (
                    <label key={`${key}-${index}`} className="block space-y-2">
                      <span className="text-sm font-bold text-slate-500">{label}</span>
                      <input
                        value={orderValues[key] || ''}
                        onChange={(e) => setOrderValues((prev) => ({ ...prev, [key]: e.target.value }))}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none"
                        placeholder={label}
                      />
                    </label>
                  );
                })}

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-500">حقول إضافية</span>
                    <button
                      type="button"
                      onClick={() => setOrderValues((prev) => ({ ...prev, [`custom_${Date.now()}`]: '' }))}
                      className="text-sm font-bold text-slate-700"
                    >
                      إضافة
                    </button>
                  </div>
                  {Object.keys(orderValues).filter((key) => !['playerId', 'uuid', 'phone', 'email'].includes(key)).length ? (
                    <div className="space-y-2">
                      {Object.entries(orderValues)
                        .filter(([key]) => !['playerId', 'uuid', 'phone', 'email'].includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="grid grid-cols-[1fr_auto] gap-2">
                            <input
                              value={key}
                              onChange={(e) => {
                                const nextKey = e.target.value.trim();
                                setOrderValues((prev) => {
                                  const copy = { ...prev };
                                  delete copy[key];
                                  copy[nextKey] = value;
                                  return copy;
                                });
                              }}
                              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              placeholder="key"
                            />
                            <input
                              value={value}
                              onChange={(e) => setOrderValues((prev) => ({ ...prev, [key]: e.target.value }))}
                              className="rounded-2xl border border-slate-200 px-3 py-2 text-sm outline-none"
                              placeholder="value"
                            />
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600">
              إلغاء
            </button>
            <button onClick={() => void submitOrder()} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white">
              تأكيد
            </button>
          </div>
        </Modal>
      ) : null}

      {modal?.kind === 'custom' ? (
        <Modal onClose={() => setModal(null)}>
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">Customize</div>
              <h2 className="text-2xl font-black">{modal.title}</h2>
            </div>
            <button onClick={() => setModal(null)} className="rounded-full bg-slate-100 p-2 text-slate-500">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4 py-4">
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-500">الصورة</span>
              <input
                value={customImage}
                onChange={(e) => setCustomImage(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                placeholder="https://..."
              />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-bold text-slate-500">هامش الربح %</span>
              <input
                value={customMargin}
                onChange={(e) => setCustomMargin(e.target.value)}
                type="number"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none"
                placeholder="0"
              />
            </label>
          </div>

          <div className="flex items-center gap-3 border-t border-slate-200 pt-4">
            <button onClick={() => setModal(null)} className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-600">
              إلغاء
            </button>
            <button onClick={saveCustomization} className="flex-1 rounded-2xl bg-slate-900 px-4 py-3 font-bold text-white">
              حفظ
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
