import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  UtensilsCrossed,
  ShoppingBag,
  Sparkles,
  Phone,
  Clock,
  MapPin,
  ChevronRight,
  ShieldCheck,
  Check,
  Plus,
  Lock,
  LogOut,
  RotateCw
} from 'lucide-react';
import { Header } from './components/Header';
import { CategoryFilter } from './components/CategoryFilter';
import { MenuCard } from './components/MenuCard';
import { CartDrawer } from './components/CartDrawer';
import { AddMenuModal } from './components/AddMenuModal';
import { SettingsModal } from './components/SettingsModal';
import { ReceiptModal } from './components/ReceiptModal';
import { PinModal } from './components/PinModal';
import { HeroFoodShowcase } from './components/HeroFoodShowcase';
import { MenuItem, MenuCategory, CartItem, ShopSettings, OrderForm } from './types/menu';
import { DEFAULT_MENU, DEFAULT_SETTINGS } from './data/defaultMenu';
import { formatRupiah } from './utils/format';
import { menuApi } from './services/menuApi';

const STORAGE_KEYS = {
  MENU_CACHE: 'jajanan_kakang_menu_cache_v3',
  SETTINGS_CACHE: 'jajanan_kakang_settings_cache_v3',
  CART: 'jajanan_kakang_cart_v3',
  SELLER_AUTH: 'jajanan_seller_auth_v3',
};

export default function App() {
  // Load Menu with offline cache fallback, then sync with online DB
  const [menuList, setMenuList] = useState<MenuItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.MENU_CACHE);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_MENU;
  });

  // Load Settings with offline cache fallback, then sync with online DB
  const [settings, setSettings] = useState<ShopSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS_CACHE);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  // Real-time Cloud Connection status
  const [isOnlineSync, setIsOnlineSync] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Load Cart from localStorage
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.CART);
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  // Security & Mode Access State
  // Rule 1: If URL has #buyer, enter buyer mode directly without PIN.
  // Rule 2: If #seller or no #buyer, require PIN (132414).
  const [isBuyerMode, setIsBuyerMode] = useState<boolean>(() => {
    return window.location.hash.toLowerCase().includes('buyer');
  });

  const [isSellerAuthenticated, setIsSellerAuthenticated] = useState<boolean>(() => {
    if (window.location.hash.toLowerCase().includes('buyer')) return false;
    return sessionStorage.getItem(STORAGE_KEYS.SELLER_AUTH) === 'true';
  });

  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(() => {
    const hasBuyerHash = window.location.hash.toLowerCase().includes('buyer');
    const isAuth = sessionStorage.getItem(STORAGE_KEYS.SELLER_AUTH) === 'true';
    return !hasBuyerHash && !isAuth;
  });

  // Category and Search filter states
  const [selectedCategory, setSelectedCategory] = useState<MenuCategory>('semua');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Drawers
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);

  // Receipt Modal State
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [lastOrderId, setLastOrderId] = useState('');
  const [lastOrderForm, setLastOrderForm] = useState<OrderForm | null>(null);
  const [lastOrderedItems, setLastOrderedItems] = useState<CartItem[]>([]);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Monitor URL Hash Changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash.includes('buyer')) {
        setIsBuyerMode(true);
        setIsSellerAuthenticated(false);
        setIsPinModalOpen(false);
      } else {
        const isAuth = sessionStorage.getItem(STORAGE_KEYS.SELLER_AUTH) === 'true';
        if (isAuth) {
          setIsBuyerMode(false);
          setIsSellerAuthenticated(true);
          setIsPinModalOpen(false);
        } else {
          setIsBuyerMode(false);
          setIsSellerAuthenticated(false);
          setIsPinModalOpen(true);
        }
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Real-time Database Initial Fetch & SSE Subscription
  useEffect(() => {
    let isSubscribed = true;

    // 1. Fetch initial menu from online database
    async function loadInitialOnlineData() {
      setIsSyncing(true);
      try {
        const onlineMenu = await menuApi.getMenu();
        if (isSubscribed && onlineMenu && onlineMenu.length > 0) {
          setMenuList(onlineMenu);
          localStorage.setItem(STORAGE_KEYS.MENU_CACHE, JSON.stringify(onlineMenu));
        }

        const onlineSettings = await menuApi.getSettings();
        if (isSubscribed && onlineSettings) {
          setSettings(onlineSettings);
          localStorage.setItem(STORAGE_KEYS.SETTINGS_CACHE, JSON.stringify(onlineSettings));
        }
      } catch (err) {
        console.warn('Gagal menghubungi online database, menggunakan data lokal:', err);
      } finally {
        if (isSubscribed) setIsSyncing(false);
      }
    }

    loadInitialOnlineData();

    // 2. Subscribe to real-time events from server
    const unsubscribe = menuApi.subscribeToRealtime(
      (event) => {
        if (!isSubscribed) return;

        if (event.menu && Array.isArray(event.menu)) {
          setMenuList(event.menu);
          localStorage.setItem(STORAGE_KEYS.MENU_CACHE, JSON.stringify(event.menu));

          // Reconcile cart if any item price or name changed
          setCart((prevCart) =>
            prevCart
              .map((c) => {
                const latest = event.menu?.find((m) => m.id === c.item.id);
                return latest ? { ...c, item: latest } : c;
              })
              .filter((c) => event.menu?.some((m) => m.id === c.item.id))
          );

          if (event.type === 'menu:updated') {
            showToast('⚡ Menu diperbarui secara real-time!');
          }
        }

        if (event.settings) {
          setSettings(event.settings);
          localStorage.setItem(STORAGE_KEYS.SETTINGS_CACHE, JSON.stringify(event.settings));
        }
      },
      (connected) => {
        if (isSubscribed) {
          setIsOnlineSync(connected);
        }
      }
    );

    return () => {
      isSubscribed = false;
      unsubscribe();
    };
  }, [showToast]);

  // Persist cart changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
    } catch {
      // ignore
    }
  }, [cart]);

  // Handle PIN success
  const handlePinSuccess = () => {
    sessionStorage.setItem(STORAGE_KEYS.SELLER_AUTH, 'true');
    setIsSellerAuthenticated(true);
    setIsBuyerMode(false);
    setIsPinModalOpen(false);
    window.location.hash = '#seller';
    showToast('Akses pengelola berhasil dibuka.');
  };

  // Handle PIN cancel / divert to Buyer Mode
  const handlePinCancelToBuyer = () => {
    setIsPinModalOpen(false);
    setIsBuyerMode(true);
    setIsSellerAuthenticated(false);
    window.location.hash = '#buyer';
    showToast('Beralih ke Menu Pembeli.');
  };

  // Exit seller mode & redirect to buyer mode
  const handleExitSellerMode = () => {
    sessionStorage.removeItem(STORAGE_KEYS.SELLER_AUTH);
    setIsSellerAuthenticated(false);
    setIsBuyerMode(true);
    window.location.hash = '#buyer';
    showToast('Telah keluar ke Tampilan Pembeli.');
  };

  // Cart calculations
  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.item.price * item.quantity, 0);
  }, [cart]);

  const cartItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) => {
      const existing = prevCart.find((c) => c.item.id === itemId);
      const targetMenuItem = menuList.find((m) => m.id === itemId);

      if (!targetMenuItem) return prevCart;

      if (!existing) {
        if (delta > 0) {
          showToast(`+1 ${targetMenuItem.name}`);
          return [...prevCart, { item: targetMenuItem, quantity: delta }];
        }
        return prevCart;
      }

      const newQty = existing.quantity + delta;
      if (newQty <= 0) {
        showToast(`Dihapus: ${targetMenuItem.name}`);
        return prevCart.filter((c) => c.item.id !== itemId);
      }

      return prevCart.map((c) =>
        c.item.id === itemId ? { ...c, quantity: newQty } : c
      );
    });
  };

  const handleClearCart = () => {
    setCart([]);
    showToast('Keranjang pesanan dikosongkan.');
  };

  // Menu Management with Online Real-time Database
  const handleSaveMenu = async (item: MenuItem) => {
    setIsSyncing(true);
    try {
      if (editingItem) {
        const updated = await menuApi.updateMenu(item);
        setMenuList(updated);
        showToast(`Menu "${item.name}" berhasil diperbarui ke database online.`);
      } else {
        const updated = await menuApi.addMenu(item);
        setMenuList(updated);
        showToast(`Menu baru "${item.name}" berhasil tersimpan dan live ke semua pembeli.`);
      }
    } catch (err) {
      console.error(err);
      // Optimistic update locally
      if (editingItem) {
        setMenuList((prev) => prev.map((m) => (m.id === item.id ? item : m)));
      } else {
        setMenuList((prev) => [item, ...prev]);
      }
      showToast('Menu tersimpan secara lokal. Akan disinkronkan saat terhubung kembali.');
    } finally {
      setIsSyncing(false);
      setEditingItem(null);
    }
  };

  const handleDeleteMenu = async (id: string) => {
    const itemToDelete = menuList.find((m) => m.id === id);
    if (!itemToDelete) return;

    if (confirm(`Hapus jajanan "${itemToDelete.name}" dari menu online?`)) {
      setIsSyncing(true);
      try {
        const updated = await menuApi.deleteMenu(id);
        setMenuList(updated);
        setCart((prev) => prev.filter((c) => c.item.id !== id));
        showToast(`Menu "${itemToDelete.name}" dihapus dari database online.`);
      } catch (err) {
        console.error(err);
        setMenuList((prev) => prev.filter((m) => m.id !== id));
        setCart((prev) => prev.filter((c) => c.item.id !== id));
        showToast(`Menu "${itemToDelete.name}" dihapus secara lokal.`);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const handleResetMenu = async () => {
    setIsSyncing(true);
    try {
      const updated = await menuApi.resetMenu();
      setMenuList(updated);
      showToast('Daftar menu online telah di-reset ke data bawaan.');
    } catch (err) {
      console.error(err);
      setMenuList(DEFAULT_MENU);
      showToast('Daftar menu di-reset secara lokal.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSettings = async (newSettings: ShopSettings) => {
    try {
      const updated = await menuApi.updateSettings(newSettings);
      setSettings(updated);
      showToast('Pengaturan toko berhasil diperbarui ke database online.');
    } catch {
      setSettings(newSettings);
      showToast('Pengaturan toko disimpan secara lokal.');
    }
  };

  const handleOrderSuccess = (
    orderId: string,
    form: OrderForm,
    orderedCart: CartItem[]
  ) => {
    setLastOrderId(orderId);
    setLastOrderForm(form);
    setLastOrderedItems([...orderedCart]);
    setIsCartOpen(false);
    setReceiptOpen(true);
    setCart([]);
  };

  // Filtered Menu Items
  const filteredMenu = useMemo(() => {
    return menuList.filter((item) => {
      const matchCat =
        selectedCategory === 'semua' || item.category === selectedCategory;
      const matchQuery =
        !searchQuery ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchQuery;
    });
  }, [menuList, selectedCategory, searchQuery]);

  // Counts per category
  const itemCounts = useMemo(() => {
    const counts: Record<MenuCategory, number> = {
      semua: menuList.length,
      gurih: 0,
      manis: 0,
      minuman: 0,
      paket: 0,
    };
    menuList.forEach((item) => {
      if (counts[item.category] !== undefined) {
        counts[item.category] += 1;
      }
    });
    return counts;
  }, [menuList]);

  const showSellerPanel = !isBuyerMode && isSellerAuthenticated;

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex flex-col font-sans pb-32 md:pb-24">
      {/* Header */}
      <Header
        settings={settings}
        cartCount={cartItemCount}
        cartTotal={cartTotal}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAddMenu={() => {
          setEditingItem(null);
          setIsAddMenuOpen(true);
        }}
        isBuyerMode={isBuyerMode}
        isSellerAuthenticated={isSellerAuthenticated}
        onExitSellerMode={handleExitSellerMode}
      />

      {/* Hero Banner with Warm Culinary Vibe */}
      <section className="bg-gradient-to-b from-amber-700 via-amber-700 to-amber-800 text-white pt-8 sm:pt-10 pb-12 sm:pb-16 px-4 sm:px-6 shadow-inner relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-center relative z-10">
          <div className="md:col-span-7 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
              <span>{settings.shopName}</span>
              <span aria-hidden="true">·</span>
              <span>Digoreng Dadakan</span>
              <span aria-hidden="true">·</span>
              <span>100% Halal</span>
            </div>

            {/* Alternating Dynamic Food Showcase from Uploaded/Live Menu */}
            <HeroFoodShowcase
              items={menuList}
              cart={cart}
              onUpdateQuantity={handleUpdateQuantity}
              showSellerPanel={showSellerPanel}
              onOpenAddMenu={() => {
                setEditingItem(null);
                setIsAddMenuOpen(true);
              }}
            />
          </div>

          <div className="md:col-span-5">
            <div className="bg-amber-900/50 border border-amber-500/40 rounded-3xl p-5 sm:p-6 backdrop-blur-md text-amber-50 space-y-4 shadow-xl">
              <div className="flex items-center justify-between pb-3 border-b border-amber-600/40">
                <span className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  Info Gerobak & Pesanan
                </span>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Lapak Buka</span>
                </span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                  <span className="font-medium">{settings.shopAddress}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-amber-300 shrink-0" />
                  <span className="font-medium">{settings.openHours}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span className="font-mono font-bold">+{settings.whatsappNumber} (Pemesanan WhatsApp)</span>
                </div>
              </div>

              {/* Clean Footer Strip */}
              <div className="pt-2 text-[11px] text-amber-200/90 border-t border-amber-600/30 flex items-center justify-between">
                <span className="font-medium text-amber-200">Pesan Langsung via WhatsApp</span>
                <span className="text-amber-300 font-bold">Siap Kirim 🛵</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content Area */}
      <main id="menu-section" className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 flex-1 w-full space-y-6">
        {/* Banner for Seller Mode (Only visible when verified) */}
        {showSellerPanel && (
          <div className="bg-amber-100/70 border border-amber-300 rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-600 text-white rounded-2xl shadow-xs">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-amber-950 flex items-center gap-2">
                  <span>Panel Pengelola Menu Penjual</span>
                  {isSyncing && (
                    <RotateCw className="w-3.5 h-3.5 animate-spin text-amber-700" />
                  )}
                </h2>
                <p className="text-xs text-amber-800">
                  Setiap perubahan menu yang Anda lakukan langsung ter-update di seluruh perangkat pembeli secara real-time.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setEditingItem(null);
                  setIsAddMenuOpen(true);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition shadow-xs flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah Menu</span>
              </button>
              <button
                onClick={() => setIsSettingsOpen(true)}
                className="px-3.5 py-2 text-xs font-bold text-stone-700 hover:text-stone-900 bg-white border border-stone-200 rounded-xl transition"
              >
                Atur WA
              </button>
              <button
                onClick={handleExitSellerMode}
                className="px-3.5 py-2 text-xs font-bold text-red-700 hover:text-red-800 bg-red-50 border border-red-200 rounded-xl transition flex items-center gap-1"
                title="Keluar ke mode pembeli"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Kunci Mode</span>
              </button>
            </div>
          </div>
        )}

        {/* Category Filter and Search Bar */}
        <div className="bg-white p-4 sm:p-5 rounded-3xl border border-stone-200/80 shadow-xs">
          <CategoryFilter
            currentCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            itemCounts={itemCounts}
          />
        </div>

        {/* Section Header */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Daftar Menu Siap Pesan
            </h2>
            <div className="flex items-center gap-2 text-xs text-stone-500 mt-0.5">
              <span>Menampilkan {filteredMenu.length} pilihan jajanan</span>
              {searchQuery && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Kata kunci: "{searchQuery}"</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Menu Cards Grid */}
        {filteredMenu.length === 0 ? (
          <div className="bg-white rounded-3xl border border-stone-200 p-12 text-center space-y-3">
            <UtensilsCrossed className="w-12 h-12 mx-auto text-stone-300 stroke-1" />
            <h3 className="text-base font-bold text-stone-800">Tidak ada menu yang sesuai</h3>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Tidak ditemukan jajanan dengan kata kunci "{searchQuery}". Silakan coba kata kunci lain.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('semua');
              }}
              className="mt-2 px-5 py-2 text-xs font-bold bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition"
            >
              Lihat Semua Menu
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {filteredMenu.map((item) => {
              const inCart = cart.find((c) => c.item.id === item.id);
              const qty = inCart ? inCart.quantity : 0;

              return (
                <MenuCard
                  key={item.id}
                  item={item}
                  quantity={qty}
                  onUpdateQuantity={handleUpdateQuantity}
                  isOwnerMode={showSellerPanel}
                  onEdit={(menu) => {
                    setEditingItem(menu);
                    setIsAddMenuOpen(true);
                  }}
                  onDelete={handleDeleteMenu}
                />
              );
            })}
          </div>
        )}

        {/* Information & Ordering Guide Section */}
        <section id="info-section" className="pt-8 pb-4">
          <div className="bg-amber-50/60 border border-amber-200/80 rounded-3xl p-6 sm:p-8">
            <h2 className="text-lg sm:text-xl font-black text-stone-900 mb-6 text-center">
              Cara Pesan Mudah di JAJANAN KAKANG
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-xs">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm mb-3">
                  1
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-1">
                  Pilih Jajanan & Jumlah
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Pilih menu favorit dan tentukan jumlah porsi menggunakan tombol (+) atau (-).
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-xs">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-800 font-black flex items-center justify-center text-sm mb-3">
                  2
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-1">
                  Pilih Pembayaran & Alamat
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Pilih COD, QRIS, atau Transfer Bank resmi (BRI, BCA, BNI a.n. Fauziah Astuti).
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-xs">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-800 font-black flex items-center justify-center text-sm mb-3">
                  3
                </div>
                <h3 className="text-sm font-bold text-stone-900 mb-1">
                  Kirim ke WhatsApp
                </h3>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Format rincian pesanan otomatis tersusun rapi untuk langsung dikirim ke WhatsApp penjual.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Cart Summary & Status Indicator */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-stone-200 shadow-2xl py-3 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          {/* Status Indicator & Total */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-600 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
              <ShoppingBag className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-stone-700">
                  {cartItemCount > 0 ? `${cartItemCount} item di keranjang` : 'Keranjang kosong'}
                </span>
                <span className="text-stone-300">·</span>
                <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Siap Antar</span>
                </span>
              </div>
              <div className="text-lg sm:text-xl font-black text-amber-700 tabular-nums">
                {formatRupiah(cartTotal)}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <button
            onClick={() => setIsCartOpen(true)}
            className={`px-5 sm:px-6 py-3 rounded-2xl text-xs sm:text-sm font-black transition-all shadow-md flex items-center gap-2 shrink-0 ${
              cartItemCount > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95'
                : 'bg-stone-200 hover:bg-stone-300 text-stone-700'
            }`}
          >
            <span>{cartItemCount > 0 ? 'Checkout via WhatsApp' : 'Buka Keranjang'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* PIN Verification Modal (132414) */}
      <PinModal
        isOpen={isPinModalOpen}
        onSuccess={handlePinSuccess}
        onCancelToBuyer={handlePinCancelToBuyer}
      />

      {/* Cart & Checkout Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQuantity={handleUpdateQuantity}
        onClearCart={handleClearCart}
        settings={settings}
        onOrderSuccess={handleOrderSuccess}
      />

      {/* Add / Edit Menu Modal (Seller Only) */}
      <AddMenuModal
        isOpen={isAddMenuOpen}
        onClose={() => {
          setIsAddMenuOpen(false);
          setEditingItem(null);
        }}
        onSaveMenu={handleSaveMenu}
        editingItem={editingItem}
      />

      {/* Settings Modal (Seller Only) */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onSaveSettings={handleSaveSettings}
        onResetMenu={handleResetMenu}
      />

      {/* Receipt Modal */}
      <ReceiptModal
        isOpen={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        orderId={lastOrderId}
        orderForm={lastOrderForm}
        orderedItems={lastOrderedItems}
        settings={settings}
      />

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50 bg-stone-900/95 backdrop-blur-md text-white text-xs font-bold px-4 py-2.5 rounded-full shadow-xl border border-stone-700 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-stone-200 bg-white py-6 px-4 text-center text-xs text-stone-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} {settings.shopName}. Semua hak cipta dilindungi.</p>
          <div className="flex items-center gap-4 text-stone-400">
            <span>Pesan Online via WhatsApp</span>
            <span aria-hidden="true">·</span>
            {isBuyerMode ? (
              <a
                href="#seller"
                onClick={() => {
                  window.location.hash = '#seller';
                  setIsPinModalOpen(true);
                }}
                aria-label="Akses Penjual"
                className="hover:text-stone-600 transition"
              >
                Akses Pemilik
              </a>
            ) : (
              <button
                onClick={handleExitSellerMode}
                className="hover:text-stone-600 transition"
              >
                Kembali ke Mode Pembeli (#buyer)
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
