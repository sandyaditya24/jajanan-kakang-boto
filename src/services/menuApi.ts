import { MenuItem, ShopSettings } from '../types/menu';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  menu?: MenuItem[];
  settings?: ShopSettings;
  error?: string;
  lastUpdated?: number;
}

export const menuApi = {
  // Fetch menu from online database
  async getMenu(): Promise<MenuItem[]> {
    try {
      const res = await fetch('/api/menu');
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const json: ApiResponse<MenuItem[]> = await res.json();
      return json.data || [];
    } catch (err) {
      console.warn('Gagal memuat menu dari server, beralih ke cache offline:', err);
      throw err;
    }
  },

  // Add new menu item to online database
  async addMenu(item: MenuItem): Promise<MenuItem[]> {
    const res = await fetch('/api/menu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Gagal menambahkan menu ke database.');
    const json: ApiResponse<MenuItem> = await res.json();
    return json.menu || [];
  },

  // Update existing menu item in online database
  async updateMenu(item: MenuItem): Promise<MenuItem[]> {
    const res = await fetch(`/api/menu/${item.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });
    if (!res.ok) throw new Error('Gagal memperbarui menu di database.');
    const json: ApiResponse<MenuItem> = await res.json();
    return json.menu || [];
  },

  // Delete menu item from online database
  async deleteMenu(id: string): Promise<MenuItem[]> {
    const res = await fetch(`/api/menu/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Gagal menghapus menu dari database.');
    const json: ApiResponse<void> = await res.json();
    return json.menu || [];
  },

  // Reset menu to defaults
  async resetMenu(): Promise<MenuItem[]> {
    const res = await fetch('/api/menu/reset', {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Gagal mereset menu.');
    const json: ApiResponse<MenuItem[]> = await res.json();
    return json.menu || [];
  },

  // Sync client menu & settings to server
  async syncMenu(menu: MenuItem[], settings?: ShopSettings, clientUpdated?: number): Promise<MenuItem[]> {
    try {
      const res = await fetch('/api/menu/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menu, settings, clientUpdated }),
      });
      if (!res.ok) return menu;
      const json: ApiResponse<MenuItem[]> = await res.json();
      return json.menu || menu;
    } catch {
      return menu;
    }
  },

  // Fetch shop settings
  async getSettings(): Promise<ShopSettings | null> {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return null;
      const json: ApiResponse<ShopSettings> = await res.json();
      return json.data || null;
    } catch {
      return null;
    }
  },

  // Update shop settings
  async updateSettings(settings: ShopSettings): Promise<ShopSettings> {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Gagal menyimpan pengaturan toko.');
    const json: ApiResponse<ShopSettings> = await res.json();
    return json.data || settings;
  },

  // Subscribe to real-time updates via Server-Sent Events (SSE)
  subscribeToRealtime(
    onData: (eventData: { type: string; menu?: MenuItem[]; settings?: ShopSettings }) => void,
    onStatusChange?: (isConnected: boolean) => void
  ): () => void {
    let eventSource: EventSource | null = null;
    let isClosed = false;

    function connect() {
      if (isClosed) return;

      try {
        eventSource = new EventSource('/api/menu/stream');

        eventSource.onopen = () => {
          onStatusChange?.(true);
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            onData(data);
          } catch (e) {
            console.error('Error parsing SSE event data:', e);
          }
        };

        eventSource.onerror = () => {
          onStatusChange?.(false);
          eventSource?.close();
          // Auto-reconnect after 3 seconds
          if (!isClosed) {
            setTimeout(connect, 3000);
          }
        };
      } catch (err) {
        console.warn('EventSource initialization error:', err);
        onStatusChange?.(false);
        if (!isClosed) {
          setTimeout(connect, 4000);
        }
      }
    }

    connect();

    // Return cleanup unsubscribe function
    return () => {
      isClosed = true;
      if (eventSource) {
        eventSource.close();
      }
    };
  },
};
