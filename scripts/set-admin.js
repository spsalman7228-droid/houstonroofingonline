/**
 * scripts/set-admin.js <email> [role=admin]
 * Manually grants staff or admin role to a user by email.
 * Run via: node scripts/set-admin.js user@example.com admin
 */

const { getAuth, getFirestore } = require('../lib/firebase');

async function setAdmin() {
  const email = process.argv[2];
  const role = process.argv[3] || 'admin';

  if (!email) {
    console.error('Usage: node scripts/set-admin.js <email> [role]');
    process.exit(1);
  }

  if (!['admin', 'staff', 'customer'].includes(role)) {
    console.error('Role must be one of: admin, staff, customer');
    process.exit(1);
  }

  console.log(`Setting role '${role}' for ${email}...`);

  const auth = getAuth();
  const db = getFirestore();

  try {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (e) {
      // In mock mode or if not found by email, search users collection
      const snap = await db.collection('users').where('email', '==', email.toLowerCase()).get();
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
      } else {
        throw new Error(`User with email ${email} not found`);
      }
    }

    const uid = userRecord.uid;
    await auth.setCustomUserClaims(uid, { role });
    await db.collection('users').doc(uid).set({ role }, { merge: true });

    console.log(`✓ Successfully updated ${email} (UID: ${uid}) to role: ${role}`);
  } catch (err) {
    console.error('Failed to set role:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  setAdmin()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
