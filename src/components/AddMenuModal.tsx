import React, { useState, useEffect } from 'react';
import { X, Upload, Sparkles, Image as ImageIcon, Link as LinkIcon } from 'lucide-react';
import { MenuItem, MenuCategory } from '../types/menu';

interface AddMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveMenu: (item: MenuItem) => void;
  editingItem?: MenuItem | null;
}

const PRESET_IMAGES = [
  { label: 'Risol Mayo', url: '/src/assets/images/food_risol_mayo_1792070156327.jpg' },
  { label: 'Cireng Rujak', url: '/src/assets/images/food_cireng_rujak_1792070156706.jpg' },
  { label: 'Dimsum Udang', url: '/src/assets/images/food_dimsum_ayam_1792070157223.jpg' },
  { label: 'Pisang Coklat', url: '/src/assets/images/food_piscok_lumer_1792070157612.jpg' },
];

export const AddMenuModal: React.FC<AddMenuModalProps> = ({
  isOpen,
  onClose,
  onSaveMenu,
  editingItem,
}) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | ''>('');
  const [category, setCategory] = useState<MenuCategory>('gurih');
  const [description, setDescription] = useState('');
  const [badge, setBadge] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (editingItem) {
      setName(editingItem.name);
      setPrice(editingItem.price);
      setCategory(editingItem.category);
      setDescription(editingItem.description);
      setBadge(editingItem.badge || '');
      setImageUrl(editingItem.image);
      setIsAvailable(editingItem.isAvailable);
    } else {
      setName('');
      setPrice('');
      setCategory('gurih');
      setDescription('');
      setBadge('');
      setImageUrl('');
      setIsAvailable(true);
    }
    setErrorMessage('');
  }, [editingItem, isOpen]);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('Ukuran file foto maksimal 5MB.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageUrl(event.target.result as string);
          setErrorMessage('');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setErrorMessage('Nama menu wajib diisi.');
      return;
    }
    if (!price || Number(price) <= 0) {
      setErrorMessage('Harga menu harus lebih besar dari Rp 0.');
      return;
    }
    if (!imageUrl) {
      setErrorMessage('Silakan upload foto atau tempel URL foto makanan terlebih dahulu.');
      return;
    }

    const newItem: MenuItem = {
      id: editingItem ? editingItem.id : `menu-${Date.now()}`,
      name: name.trim(),
      price: Number(price),
      category,
      description: description.trim() || 'Menu jajanan lezat siap saji.',
      badge: badge.trim() || undefined,
      image: imageUrl,
      isAvailable,
    };

    onSaveMenu(newItem);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-stone-200">
            <div>
              <h2 className="text-lg font-bold text-stone-900">
                {editingItem ? 'Edit Menu Jajanan' : 'Tambah Menu Baru'}
              </h2>
              <p className="text-xs text-stone-500 mt-0.5">
                Isi rincian jajanan untuk ditampilkan di daftar menu pembeli
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-stone-400 hover:text-stone-700 rounded-lg hover:bg-stone-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {errorMessage && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">
              {errorMessage}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {/* Image Preview & Upload */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Foto Makanan <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-24 h-24 rounded-xl border border-stone-200 overflow-hidden bg-stone-100 shrink-0">
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-stone-400 p-2 text-center">
                      <ImageIcon className="w-6 h-6 mb-1 text-stone-300" />
                      <span className="text-[10px]">Belum ada foto</span>
                    </div>
                  )}
                </div>

                <div className="flex-1 w-full space-y-2">
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-stone-300 rounded-xl text-xs font-medium text-stone-700 hover:bg-stone-50 cursor-pointer transition">
                    <Upload className="w-4 h-4 text-amber-600" />
                    <span>Upload Foto dari Galeri / Kamera</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  {/* URL Input option */}
                  <div className="flex items-center gap-1.5">
                    <div className="relative flex-1">
                      <input
                        type="url"
                        value={imageUrl.startsWith('data:') ? '' : imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        placeholder="Atau tempel URL gambar (https://...)"
                        className="w-full pl-7 pr-3 py-1.5 text-xs bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <LinkIcon className="w-3.5 h-3.5 text-stone-400 absolute left-2 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  {/* Preset photo options */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    <span className="text-[10px] text-stone-400 shrink-0">Foto Bawaan:</span>
                    {PRESET_IMAGES.map((p, idx) => (
                      <button
                        type="button"
                        key={idx}
                        onClick={() => setImageUrl(p.url)}
                        className={`text-[11px] px-2 py-0.5 rounded-md border whitespace-nowrap transition ${
                          imageUrl === p.url
                            ? 'bg-amber-100 text-amber-800 border-amber-300 font-semibold'
                            : 'bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-100'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Menu Name */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Nama Menu <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Contoh: Risol Mayo Beef Keju"
                required
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>

            {/* Price & Category */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Harga Satuan (Rp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value ? Number(e.target.value) : '')}
                  placeholder="Contoh: 6000"
                  required
                  min={500}
                  step={500}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Kategori
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as MenuCategory)}
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="gurih">Gurih & Renyah</option>
                  <option value="manis">Manis Lumer</option>
                  <option value="minuman">Minuman Segar</option>
                  <option value="paket">Paket Hemat</option>
                </select>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Deskripsi Menu (Opsional)
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Keterangan rasa, isian atau porsi porsi..."
                className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              />
            </div>

            {/* Badge & Availability */}
            <div className="grid grid-cols-2 gap-3 items-center">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Label Promo / Badge (Opsional)
                </label>
                <input
                  type="text"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="Contoh: Terlaris, Crispy, Baru"
                  className="w-full px-3 py-2 text-sm bg-white border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAvailable}
                    onChange={(e) => setIsAvailable(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-stone-300 focus:ring-amber-500"
                  />
                  <span className="text-xs font-semibold text-stone-700">Status Ready / Tersedia</span>
                </label>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-4 border-t border-stone-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-stone-600 hover:text-stone-800 hover:bg-stone-100 rounded-xl transition"
              >
                Batal
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-xl shadow-sm transition"
              >
                {editingItem ? 'Simpan Perubahan' : 'Tambahkan ke Menu'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
