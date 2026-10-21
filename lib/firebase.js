/**
 * lib/firebase.js
 * Dual-mode Firebase adapter:
 * - Initializes firebase-admin when FIREBASE_SERVICE_ACCOUNT_B64 is provided.
 * - Otherwise provides an in-memory Firestore & Auth mock that mirrors the Admin SDK contract,
 *   enabling zero-config instant preview in dev/test while supporting production Firebase.
 */

const fs = require('fs');
const path = require('path');

let admin = null;
let isMock = false;

// In-memory / file-persisted store for mock mode
const mockStore = {
  users: new Map(),
  appointments: new Map(),
  slots: new Map(),
  projects: new Map(),
  events: new Map(), // key: `${projectId}_${eventId}`
  notifications: new Map(), // key: `${uid}_${nid}`
  announcements: new Map(),
  reviews: new Map(),
  settings: new Map(),
  auditLogs: new Map(),
};

// Seed mock store with content/settings.json if empty
function initializeMockData() {
  try {
    const settingsPath = path.join(__dirname, '..', 'content', 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (data.booking) mockStore.settings.set('booking', data.booking);
      if (data.stages) mockStore.settings.set('stages', data.stages);
      if (data.announcementTemplates) {
        mockStore.announcements.set('notice-1', {
          id: 'notice-1',
          title: 'Storm watch: priority assessments open',
          body: 'Severe weather in Greater Houston. Book an inspection now for prioritized schedule.',
          severity: 'storm',
          pinned: true,
          startAt: new Date(Date.now() - 3600000).toISOString(),
          endAt: new Date(Date.now() + 86400000 * 7).toISOString(),
          createdBy: 'system'
        });
        mockStore.announcements.set('notice-2', {
          id: 'notice-2',
          title: 'Spring schedule update',
          body: 'We are expanding commercial and residential inspection capacity across Harris and Montgomery counties.',
          severity: 'info',
          pinned: false,
          startAt: new Date(Date.now() - 3600000).toISOString(),
          endAt: new Date(Date.now() + 86400000 * 14).toISOString(),
          createdBy: 'system'
        });
      }
    }

    // Seed sample reviews
    const assetPath = path.join(__dirname, '..', 'public', 'assets', 'aistudio', 'all-data_c6023a83.json');
    if (fs.existsSync(assetPath)) {
      try {
        const full = JSON.parse(fs.readFileSync(assetPath, 'utf8'));
        if (full.sampleReviews) {
          full.sampleReviews.forEach((rev) => {
            mockStore.reviews.set(rev.id, {
              ...rev,
              verified: false,
              status: 'approved',
              createdAt: new Date().toISOString()
            });
          });
        }
      } catch (e) {
        // Ignore multi-json parse edge case
      }
    }

    // Seed default demo admin user
    const demoAdminUid = 'demo-admin-uid';
    mockStore.users.set(demoAdminUid, {
      uid: demoAdminUid,
      email: 'admin@houstonroofingonline.com',
      displayName: 'Admin Manager',
      role: 'admin',
      createdAt: new Date().toISOString()
    });

    // Seed default demo customer user
    const demoCustomerUid = 'demo-customer-uid';
    mockStore.users.set(demoCustomerUid, {
      uid: demoCustomerUid,
      email: 'customer@example.com',
      displayName: 'Jane Doe',
      phone: '(832) 555-0199',
      role: 'customer',
      createdAt: new Date().toISOString()
    });

    // Seed a sample project for the demo customer
    const demoProjId = 'proj-101';
    mockStore.projects.set(demoProjId, {
      id: demoProjId,
      uid: demoCustomerUid,
      title: 'Roof Replacement - Cypress Residence',
      serviceType: 'residential-asphalt-replacement',
      propertyType: 'Single-family home',
      address: { street: '14202 Spring Meadow Ln', city: 'Cypress', state: 'TX', zip: '77429' },
      stageKey: 'estimate-delivered',
      stageIndex: 3,
      startedAt: new Date(Date.now() - 86400000 * 3).toISOString()
    });

    mockStore.events.set(`${demoProjId}_ev-1`, {
      id: 'ev-1',
      projectId: demoProjId,
      stageKey: 'request-received',
      note: 'Online inspection booked. Project manager assigned.',
      images: [],
      actor: 'System',
      actorRole: 'system',
      visibleToCustomer: true,
      createdAt: new Date(Date.now() - 86400000 * 3).toISOString()
    });

    mockStore.events.set(`${demoProjId}_ev-2`, {
      id: 'ev-2',
      projectId: demoProjId,
      stageKey: 'inspection-complete',
      note: 'Roof and attic inspected. Minor hail indentations on south-facing slope.',
      images: ['https://images.unsplash.com/photo-1632759145351-1d592919f522?auto=format&fit=crop&w=600&q=80'],
      actor: 'David Miller',
      actorRole: 'staff',
      visibleToCustomer: true,
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString()
    });

    mockStore.events.set(`${demoProjId}_ev-3`, {
      id: 'ev-3',
      projectId: demoProjId,
      stageKey: 'estimate-delivered',
      note: 'Good / Better / Best estimate uploaded for review.',
      images: [],
      actor: 'David Miller',
      actorRole: 'staff',
      visibleToCustomer: true,
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
    });

    // Add in-app notification for demo customer
    mockStore.notifications.set(`${demoCustomerUid}_notif-1`, {
      id: 'notif-1',
      uid: demoCustomerUid,
      title: 'Estimate Ready for Review',
      body: 'Your tiered roofing estimate is ready on your dashboard.',
      link: '/dashboard',
      read: false,
      createdAt: new Date(Date.now() - 86400000 * 1).toISOString()
    });

  } catch (err) {
    console.warn('Mock store initialization warning:', err.message);
  }
}

// Check for live Firebase Service Account
if (process.env.FIREBASE_SERVICE_ACCOUNT_B64 && !process.env.FIREBASE_SERVICE_ACCOUNT_B64.includes('...')) {
  try {
    const raw = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, 'base64').toString('utf8');
    const creds = JSON.parse(raw);
    if (creds && creds.project_id && creds.private_key) {
      const fbAdmin = require('firebase-admin');
      const apps = fbAdmin.apps || (fbAdmin.default && fbAdmin.default.apps) || [];
      if (!apps.length) {
        fbAdmin.initializeApp({
          credential: fbAdmin.credential.cert(creds)
        });
      }
      admin = fbAdmin;
      isMock = false;
      console.log('Firebase Admin SDK initialized successfully with service account.');
    } else {
      admin = null;
      isMock = true;
    }
  } catch (e) {
    admin = null;
    isMock = true;
  }
} else {
  admin = null;
  isMock = true;
}

if (isMock) {
  initializeMockData();
}

/**
 * Mock Firestore Document Reference
 */
class MockDocRef {
  constructor(collectionName, docId) {
    this.collectionName = collectionName;
    this.id = docId;
  }

  async get() {
    const map = mockStore[this.collectionName];
    const data = map ? map.get(this.id) : null;
    return {
      id: this.id,
      exists: data !== undefined && data !== null,
      data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
    };
  }

  async set(data, options = {}) {
    const map = mockStore[this.collectionName];
    if (!map) mockStore[this.collectionName] = new Map();
    if (options.merge) {
      const existing = mockStore[this.collectionName].get(this.id) || {};
      mockStore[this.collectionName].set(this.id, { ...existing, ...data, id: this.id });
    } else {
      mockStore[this.collectionName].set(this.id, { ...data, id: this.id });
    }
    return { writeTime: new Date() };
  }

  async update(data) {
    const map = mockStore[this.collectionName];
    if (!map || !map.has(this.id)) {
      throw new Error(`Document ${this.collectionName}/${this.id} does not exist`);
    }
    const existing = map.get(this.id);
    map.set(this.id, { ...existing, ...data });
    return { writeTime: new Date() };
  }

  async delete() {
    const map = mockStore[this.collectionName];
    if (map) map.delete(this.id);
    return { writeTime: new Date() };
  }

  collection(subName) {
    // For projects/{id}/events or users/{uid}/notifications
    if (this.collectionName === 'projects' && subName === 'events') {
      return new MockProjectEventsCollection(this.id);
    }
    if (this.collectionName === 'users' && subName === 'notifications') {
      return new MockUserNotificationsCollection(this.id);
    }
    return new MockCollectionRef(`${this.collectionName}_${this.id}_${subName}`);
  }
}

class MockProjectEventsCollection {
  constructor(projectId) {
    this.projectId = projectId;
  }

  doc(id = 'ev_' + Math.random().toString(36).substring(2, 9)) {
    const key = `${this.projectId}_${id}`;
    return {
      id,
      set: async (data) => {
        mockStore.events.set(key, { ...data, id, projectId: this.projectId });
        return { writeTime: new Date() };
      },
      get: async () => {
        const item = mockStore.events.get(key);
        return {
          id,
          exists: !!item,
          data: () => (item ? JSON.parse(JSON.stringify(item)) : null)
        };
      }
    };
  }

  async get() {
    const results = [];
    for (const [key, val] of mockStore.events.entries()) {
      if (key.startsWith(`${this.projectId}_`)) {
        results.push({ id: val.id, data: () => ({ ...val }) });
      }
    }
    results.sort((a, b) => new Date(a.data().createdAt) - new Date(b.data().createdAt));
    return {
      docs: results,
      empty: results.length === 0,
      size: results.length
    };
  }
}

class MockUserNotificationsCollection {
  constructor(uid) {
    this.uid = uid;
  }

  doc(id = 'notif_' + Math.random().toString(36).substring(2, 9)) {
    const key = `${this.uid}_${id}`;
    return {
      id,
      set: async (data) => {
        mockStore.notifications.set(key, { ...data, id, uid: this.uid });
        return { writeTime: new Date() };
      },
      update: async (data) => {
        const existing = mockStore.notifications.get(key) || {};
        mockStore.notifications.set(key, { ...existing, ...data });
        return { writeTime: new Date() };
      },
      get: async () => {
        const item = mockStore.notifications.get(key);
        return {
          id,
          exists: !!item,
          data: () => (item ? JSON.parse(JSON.stringify(item)) : null)
        };
      }
    };
  }

  async get() {
    const results = [];
    for (const [key, val] of mockStore.notifications.entries()) {
      if (key.startsWith(`${this.uid}_`)) {
        results.push({ id: val.id, data: () => ({ ...val }) });
      }
    }
    results.sort((a, b) => new Date(b.data().createdAt) - new Date(a.data().createdAt));
    return {
      docs: results,
      empty: results.length === 0,
      size: results.length
    };
  }
}

class MockCollectionRef {
  constructor(name) {
    this.name = name;
    this.filters = [];
    this.orderings = [];
    this.limitVal = null;
  }

  doc(id) {
    const docId = id || Math.random().toString(36).substring(2, 11);
    return new MockDocRef(this.name, docId);
  }

  where(field, op, value) {
    const query = new MockCollectionRef(this.name);
    query.filters = [...this.filters, { field, op, value }];
    query.orderings = [...this.orderings];
    query.limitVal = this.limitVal;
    return query;
  }

  orderBy(field, dir = 'asc') {
    const query = new MockCollectionRef(this.name);
    query.filters = [...this.filters];
    query.orderings = [...this.orderings, { field, dir }];
    query.limitVal = this.limitVal;
    return query;
  }

  limit(n) {
    const query = new MockCollectionRef(this.name);
    query.filters = [...this.filters];
    query.orderings = [...this.orderings];
    query.limitVal = n;
    return query;
  }

  async get() {
    const map = mockStore[this.name] || new Map();
    let items = Array.from(map.values());

    for (const filter of this.filters) {
      items = items.filter((item) => {
        const val = item[filter.field];
        if (filter.op === '==') return val === filter.value;
        if (filter.op === '!=') return val !== filter.value;
        if (filter.op === '>=') return val >= filter.value;
        if (filter.op === '<=') return val <= filter.value;
        if (filter.op === '>') return val > filter.value;
        if (filter.op === '<') return val < filter.value;
        if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(val);
        return true;
      });
    }

    for (const order of this.orderings) {
      items.sort((a, b) => {
        const valA = a[order.field];
        const valB = b[order.field];
        if (valA < valB) return order.dir === 'asc' ? -1 : 1;
        if (valA > valB) return order.dir === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (this.limitVal) {
      items = items.slice(0, this.limitVal);
    }

    const docs = items.map((data) => ({
      id: data.id,
      exists: true,
      data: () => JSON.parse(JSON.stringify(data))
    }));

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length
    };
  }

  async add(data) {
    const id = Math.random().toString(36).substring(2, 11);
    const docRef = this.doc(id);
    await docRef.set(data);
    return docRef;
  }
}

/**
 * Mock Firestore instance
 */
const mockFirestore = {
  collection: (name) => new MockCollectionRef(name),
  doc: (pathStr) => {
    const parts = pathStr.split('/');
    if (parts.length === 2) {
      return new MockDocRef(parts[0], parts[1]);
    }
    throw new Error('Only 2-part paths supported in mock doc()');
  },
  runTransaction: async (updateFunction) => {
    // Transaction wrapper with atomic get and set/update
    const transaction = {
      get: async (docRef) => docRef.get(),
      set: (docRef, data, options) => docRef.set(data, options),
      update: (docRef, data) => docRef.update(data),
      delete: (docRef) => docRef.delete()
    };
    return await updateFunction(transaction);
  }
};

/**
 * Mock Auth instance
 */
const mockAuth = {
  verifyIdToken: async (token) => {
    if (!token) throw new Error('No token provided');
    // If it's a demo or test token
    if (token === 'demo-admin-token' || token === 'admin-token') {
      return {
        uid: 'demo-admin-uid',
        email: 'admin@houstonroofingonline.com',
        name: 'Admin Manager',
        role: 'admin'
      };
    }
    if (token.startsWith('user-')) {
      const uid = token;
      return {
        uid,
        email: `${uid}@example.com`,
        name: 'Jane Customer',
        role: 'customer'
      };
    }
    // Generic fallback for simulation
    return {
      uid: 'demo-customer-uid',
      email: 'customer@example.com',
      name: 'Jane Doe',
      role: 'customer'
    };
  },
  createSessionCookie: async (idToken, options) => {
    return `session_${Buffer.from(idToken).toString('base64')}`;
  },
  verifySessionCookie: async (sessionCookie, checkRevoked = false) => {
    if (!sessionCookie || !sessionCookie.startsWith('session_')) {
      throw new Error('Invalid session cookie');
    }
    const token = Buffer.from(sessionCookie.replace('session_', ''), 'base64').toString('utf8');
    return await mockAuth.verifyIdToken(token);
  },
  setCustomUserClaims: async (uid, claims) => {
    const user = mockStore.users.get(uid);
    if (user) {
      mockStore.users.set(uid, { ...user, role: claims.role });
    }
    return null;
  },
  getUser: async (uid) => {
    const user = mockStore.users.get(uid);
    if (!user) throw new Error('User not found');
    return {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      customClaims: { role: user.role }
    };
  }
};

module.exports = {
  isMock,
  getFirestore: () => (!isMock && admin ? admin.firestore() : mockFirestore),
  getAuth: () => (!isMock && admin ? admin.auth() : mockAuth),
  mockStore // exported for unit/emulator testing
};
