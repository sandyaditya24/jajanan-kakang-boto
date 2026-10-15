import express from 'express';
import type { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DEFAULT_MENU, DEFAULT_SETTINGS } from './src/data/defaultMenu.ts';
import type { MenuItem, ShopSettings, SavedOrder } from './src/types/menu.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// High payload limit for image data URLs
app.use(express.json({ limit: '15mb' }));

// Database storage file path inside the project repository
const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'database.json');

interface DatabaseSchema {
  menu: MenuItem[];
  orders: SavedOrder[];
  settings: ShopSettings;
  lastUpdated: number;
}

// Initialize database from file or defaults
function loadDatabase(): DatabaseSchema {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed.menu)) {
        return {
          menu: parsed.menu,
          orders: Array.isArray(parsed.orders) ? parsed.orders : [],
          settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : DEFAULT_SETTINGS,
          lastUpdated: parsed.lastUpdated || Date.now(),
        };
      }
    }
  } catch (err) {
    console.error('Error reading database file:', err);
  }

  const initialData: DatabaseSchema = {
    menu: DEFAULT_MENU, // default is empty []
    orders: [],
    settings: DEFAULT_SETTINGS,
    lastUpdated: Date.now(),
  };

  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing initial database file:', err);
  }

  return initialData;
}

function saveDatabase(data: DatabaseSchema): void {
  data.lastUpdated = Date.now();
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
  }
}

let db = loadDatabase();

// Connected SSE clients for real-time synchronization
const sseClients = new Set<Response>();

function broadcast(payload: Record<string, unknown>) {
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(data);
    } catch {
      sseClients.delete(client);
    }
  }
}

// Keep-alive heartbeat every 20 seconds to prevent connection timeouts
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': heartbeat\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 20000);

// --- API ROUTES ---

// 1. Get current menu
app.get('/api/menu', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: db.menu,
    lastUpdated: db.lastUpdated,
  });
});

// 2. Real-time Server-Sent Events (SSE) Stream
app.get('/api/menu/stream', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // Send initial data snapshot to newly connected client
  res.write(
    `data: ${JSON.stringify({
      type: 'init',
      menu: db.menu,
      orders: db.orders,
      settings: db.settings,
      lastUpdated: db.lastUpdated,
    })}\n\n`
  );

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

// 3. Add new menu item
app.post('/api/menu', (req: Request, res: Response) => {
  const newItem: MenuItem = req.body;
  if (!newItem.name || typeof newItem.price !== 'number') {
    res.status(400).json({ success: false, error: 'Nama dan harga menu wajib diisi.' });
    return;
  }

  if (!newItem.id) {
    newItem.id = `menu-${Date.now()}`;
  }

  // Prepend new item
  db.menu = [newItem, ...db.menu.filter((m) => m.id !== newItem.id)];
  saveDatabase(db);

  broadcast({
    type: 'menu:updated',
    action: 'add',
    item: newItem,
    menu: db.menu,
    lastUpdated: db.lastUpdated,
  });

  res.json({ success: true, data: newItem, menu: db.menu });
});

// 4. Update existing menu item
app.put('/api/menu/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const updatedItem: MenuItem = req.body;

  const index = db.menu.findIndex((m) => m.id === id);
  if (index === -1) {
    res.status(404).json({ success: false, error: 'Menu tidak ditemukan.' });
    return;
  }

  db.menu[index] = { ...db.menu[index], ...updatedItem, id };
  saveDatabase(db);

  broadcast({
    type: 'menu:updated',
    action: 'update',
    item: db.menu[index],
    menu: db.menu,
    lastUpdated: db.lastUpdated,
  });

  res.json({ success: true, data: db.menu[index], menu: db.menu });
});

// 5. Delete menu item
app.delete('/api/menu/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const beforeCount = db.menu.length;
  db.menu = db.menu.filter((m) => m.id !== id);

  if (db.menu.length === beforeCount) {
    res.status(404).json({ success: false, error: 'Menu tidak ditemukan.' });
    return;
  }

  saveDatabase(db);

  broadcast({
    type: 'menu:updated',
    action: 'delete',
    id,
    menu: db.menu,
    lastUpdated: db.lastUpdated,
  });

  res.json({ success: true, id, menu: db.menu });
});

// 6. Reset menu to defaults (empty list)
app.post('/api/menu/reset', (req: Request, res: Response) => {
  db.menu = [];
  saveDatabase(db);

  broadcast({
    type: 'menu:updated',
    action: 'reset',
    menu: db.menu,
    lastUpdated: db.lastUpdated,
  });

  res.json({ success: true, menu: db.menu });
});

// 6b. Sync client menu and settings
app.post('/api/menu/sync', (req: Request, res: Response) => {
  const { menu, settings, clientUpdated } = req.body;
  let changed = false;

  if (Array.isArray(menu)) {
    db.menu = menu;
    changed = true;
  }
  if (settings && typeof settings === 'object') {
    db.settings = { ...db.settings, ...settings };
    changed = true;
  }

  if (changed) {
    db.lastUpdated = clientUpdated || Date.now();
    saveDatabase(db);
    broadcast({
      type: 'menu:updated',
      action: 'sync',
      menu: db.menu,
      settings: db.settings,
      lastUpdated: db.lastUpdated,
    });
  }

  res.json({ success: true, menu: db.menu, settings: db.settings, lastUpdated: db.lastUpdated });
});

// 7. Get shop settings
app.get('/api/settings', (req: Request, res: Response) => {
  res.json({ success: true, data: db.settings });
});

// 8. Update shop settings
app.put('/api/settings', (req: Request, res: Response) => {
  db.settings = { ...db.settings, ...req.body };
  saveDatabase(db);

  broadcast({
    type: 'settings:updated',
    settings: db.settings,
    lastUpdated: db.lastUpdated,
  });

  res.json({ success: true, data: db.settings });
});

// 9. Orders API (Daftar Riwayat Pesanan)
app.get('/api/orders', (req: Request, res: Response) => {
  res.json({ success: true, data: db.orders || [] });
});

app.post('/api/orders', (req: Request, res: Response) => {
  const order: SavedOrder = req.body;
  if (!order || !order.id) {
    res.status(400).json({ success: false, error: 'Data pesanan tidak valid' });
    return;
  }

  db.orders = [order, ...(db.orders || []).filter((o) => o.id !== order.id)];
  saveDatabase(db);

  broadcast({
    type: 'order:new',
    order,
    orders: db.orders,
  });

  res.json({ success: true, data: order, orders: db.orders });
});

app.put('/api/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  db.orders = (db.orders || []).map((o) => (o.id === id ? { ...o, status } : o));
  saveDatabase(db);

  broadcast({
    type: 'order:updated',
    id,
    status,
    orders: db.orders,
  });

  res.json({ success: true, orders: db.orders });
});

app.delete('/api/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  db.orders = (db.orders || []).filter((o) => o.id !== id);
  saveDatabase(db);

  broadcast({
    type: 'order:deleted',
    id,
    orders: db.orders,
  });

  res.json({ success: true, orders: db.orders });
});

app.delete('/api/orders', (req: Request, res: Response) => {
  db.orders = [];
  saveDatabase(db);

  broadcast({
    type: 'order:cleared',
    orders: [],
  });

  res.json({ success: true, orders: [] });
});

// --- VITE MIDDLEWARE / STATIC ASSETS ---
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server JAJANAN KAKANG berjalan di http://0.0.0.0:${PORT}`);
  });
}

startServer();
