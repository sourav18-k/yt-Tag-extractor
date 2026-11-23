import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import type {
  AdminAppConfig,
  AdminNotificationRecord,
  AdminTransactionRecord,
  AdminUserActivityItem,
  AdminUserRecord,
  AuthUserState,
  PublicAppConfig,
  VerifiedSubscriptionEntry,
  VerifiedTransactionEntry,
  VideoDetails,
} from '../types/video';

export const AUTHORIZED_ADMIN_EMAIL = 'berasourav5132@gmail.com';

function detectClientDeviceType(): 'Desktop' | 'Mobile' | 'Tablet' | 'Unknown' {
  if (typeof navigator === 'undefined') return 'Unknown';
  const ua = navigator.userAgent.toLowerCase();
  if (!ua) return 'Unknown';
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/i.test(ua)) return 'Tablet';
  if (/mobile|iphone|ipod|android|blackberry|iemobile|opera mini/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

function toIsoString(val: unknown): string {
  if (val instanceof Timestamp) return val.toDate().toISOString();
  if (val && typeof val === 'object' && 'toDate' in val && typeof (val as { toDate: () => Date }).toDate === 'function') {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof val === 'string' && val.trim()) return val;
  return new Date().toISOString();
}

function sanitizeVideoSnapshot(video: VideoDetails): Record<string, unknown> {
  return {
    videoId: video.videoId,
    url: video.url,
    embedUrl: video.embedUrl,
    title: video.title.slice(0, 300),
    description: video.description.slice(0, 4000),
    durationSeconds: video.durationSeconds,
    durationFormatted: video.durationFormatted,
    durationReadable: video.durationReadable,
    tags: video.tags.slice(0, 40),
    hashtags: video.hashtags.slice(0, 20),
    category: video.category,
    publishDate: video.publishDate,
    viewCount: video.viewCount,
    likeCount: video.likeCount,
    isLiveContent: video.isLiveContent,
    isShorts: video.isShorts,
    familySafe: video.familySafe,
    thumbnails: video.thumbnails.slice(0, 5),
    channel: {
      id: video.channel.id,
      name: video.channel.name,
      handle: video.channel.handle,
      url: video.channel.url,
      avatarUrl: video.channel.avatarUrl,
      bannerUrl: video.channel.bannerUrl,
      subscriberCount: video.channel.subscriberCount,
      videoCount: video.channel.videoCount,
      totalViews: video.channel.totalViews,
      country: video.channel.country,
      joinedDate: video.channel.joinedDate,
      description: video.channel.description ? video.channel.description.slice(0, 1000) : null,
      verified: video.channel.verified,
    },
    relatedVideos: video.relatedVideos.slice(0, 10),
    fetchedAt: video.fetchedAt,
  };
}

export async function syncAuthenticatedUserToFirestore(user: User): Promise<AuthUserState> {
  const uid = user.uid;
  const email = (user.email || '').trim().toLowerCase();
  const displayName = (user.displayName || email.split('@')[0] || 'ClipLens User').slice(0, 80);
  const photoURL = user.photoURL ? user.photoURL.slice(0, 500) : undefined;
  const isBootstrappedAdmin =
    Boolean(user.emailVerified) && email === AUTHORIZED_ADMIN_EMAIL.toLowerCase();

  // Only verified users can write according to firestore.rules
  if (!user.emailVerified) {
    return {
      uid,
      displayName,
      email,
      emailVerified: false,
      photoURL: photoURL ?? null,
      isAdmin: false,
      subscriptionPlan: 'free',
      subscriptionStatus: 'none',
      status: 'active',
    };
  }

  const userDocPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let existingPlan: 'free' | 'monthly' | 'annual' = 'free';
  let existingSubStatus: 'none' | 'active' | 'expired' | 'cancelled' = 'none';
  let existingStatus: 'active' | 'suspended' = 'active';
  let existingRole: 'user' | 'admin' = isBootstrappedAdmin ? 'admin' : 'user';

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      const basePayload: Record<string, unknown> = {
        uid,
        displayName,
        subscriptionPlan: 'free',
        subscriptionStatus: 'none',
        status: 'active',
        role: 'user',
        inspectionCount: 0,
        aiToolRuns: 0,
        deviceType: detectClientDeviceType(),
        registeredAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (photoURL) {
        basePayload.photoURL = photoURL;
      }
      await setDoc(userRef, basePayload);
    } else {
      const data = snap.data();
      existingPlan =
        data.subscriptionPlan === 'monthly' || data.subscriptionPlan === 'annual'
          ? data.subscriptionPlan
          : 'free';
      existingSubStatus =
        data.subscriptionStatus === 'active' ||
        data.subscriptionStatus === 'expired' ||
        data.subscriptionStatus === 'cancelled'
          ? data.subscriptionStatus
          : 'none';
      existingStatus = data.status === 'suspended' ? 'suspended' : 'active';
      existingRole = data.role === 'admin' ? 'admin' : existingRole;

      if (existingStatus === 'active') {
        const updatePayload: Record<string, unknown> = {
          displayName,
          deviceType: detectClientDeviceType(),
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        };
        if (photoURL) {
          updatePayload.photoURL = photoURL;
        }
        await updateDoc(userRef, updatePayload);
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userDocPath);
  }

  // Isolated PII email record
  const privatePath = `users/${uid}/private/info`;
  const privateRef = doc(db, 'users', uid, 'private', 'info');
  try {
    const privSnap = await getDoc(privateRef);
    if (!privSnap.exists() && email) {
      await setDoc(privateRef, {
        uid,
        email: email.slice(0, 120),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else if (privSnap.exists() && email && privSnap.data().email !== email) {
      await updateDoc(privateRef, {
        email: email.slice(0, 120),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, privatePath);
  }

  // Bootstrap or verify admin membership
  let isAdmin = isBootstrappedAdmin;
  const adminDocPath = `admins/${uid}`;
  const adminRef = doc(db, 'admins', uid);
  try {
    const adminSnap = await getDoc(adminRef);
    if (adminSnap.exists()) {
      isAdmin = true;
    } else if (isBootstrappedAdmin && email) {
      await setDoc(adminRef, {
        uid,
        email: email.slice(0, 120),
        displayName,
        role: 'admin',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      isAdmin = true;
    }
  } catch (err) {
    // Non-admins may not pass create if they try; only treat unexpected errors on actual admin check
    if (isBootstrappedAdmin) {
      handleFirestoreError(err, OperationType.WRITE, adminDocPath);
    }
  }

  return {
    uid,
    displayName,
    email,
    emailVerified: user.emailVerified,
    photoURL: photoURL ?? null,
    isAdmin: isAdmin || existingRole === 'admin',
    subscriptionPlan: existingPlan,
    subscriptionStatus: existingSubStatus,
    status: existingStatus,
  };
}

export async function listUserSavedVideos(uid: string): Promise<VideoDetails[]> {
  const path = `users/${uid}/savedVideos`;
  try {
    const q = query(
      collection(db, 'users', uid, 'savedVideos'),
      where('uid', '==', uid),
      orderBy('savedAt', 'desc'),
      limit(25)
    );
    const snap = await getDocs(q);
    const items: VideoDetails[] = [];
    snap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.videoSnapshot && typeof data.videoSnapshot === 'object') {
        items.push(data.videoSnapshot as VideoDetails);
      }
    });
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function saveUserVideoToFirestore(uid: string, video: VideoDetails): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(video.videoId)) return;
  const path = `users/${uid}/savedVideos/${video.videoId}`;
  const ref = doc(db, 'users', uid, 'savedVideos', video.videoId);
  try {
    const existing = await getDoc(ref);
    const firstThumb =
      video.thumbnails.find((t) => t.available)?.proxyUrl ||
      video.thumbnails[0]?.proxyUrl ||
      `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

    if (existing.exists()) {
      await updateDoc(ref, {
        url: video.url.slice(0, 500),
        title: video.title.slice(0, 300),
        channelName: (video.channel.name || 'YouTube Channel').slice(0, 120),
        durationFormatted: (video.durationFormatted || '0:00').slice(0, 32),
        thumbnailUrl: firstThumb.slice(0, 500),
        viewCount: video.viewCount ?? null,
        videoSnapshot: sanitizeVideoSnapshot(video),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(ref, {
        uid,
        videoId: video.videoId,
        url: video.url.slice(0, 500),
        title: video.title.slice(0, 300),
        channelName: (video.channel.name || 'YouTube Channel').slice(0, 120),
        durationFormatted: (video.durationFormatted || '0:00').slice(0, 32),
        thumbnailUrl: firstThumb.slice(0, 500),
        viewCount: video.viewCount ?? null,
        videoSnapshot: sanitizeVideoSnapshot(video),
        savedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteUserVideoFromFirestore(uid: string, videoId: string): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(videoId)) return;
  const path = `users/${uid}/savedVideos/${videoId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'savedVideos', videoId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function clearUserSavedVideosFromFirestore(uid: string): Promise<void> {
  const path = `users/${uid}/savedVideos`;
  try {
    const q = query(collection(db, 'users', uid, 'savedVideos'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    snap.forEach((docSnap) => batch.delete(docSnap.ref));
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function logUserActivityAndCounter(
  uid: string,
  action: string,
  counterField?: 'inspectionCount' | 'aiToolRuns',
  targetId?: string
): Promise<void> {
  const activityId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const actPath = `users/${uid}/activity/${activityId}`;
  try {
    const payload: Record<string, unknown> = {
      uid,
      action: action.slice(0, 160),
      timestamp: serverTimestamp(),
    };
    if (targetId) {
      payload.targetId = targetId.slice(0, 128);
    }
    await setDoc(doc(db, 'users', uid, 'activity', activityId), payload);

    if (counterField) {
      await updateDoc(doc(db, 'users', uid), {
        [counterField]: increment(1),
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, actPath);
  }
}

export async function fetchPublicConfigFromFirestore(): Promise<PublicAppConfig | null> {
  try {
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'public'));
    const notifsSnap = await getDocs(
      query(collection(db, 'notifications'), where('active', '==', true), limit(10))
    );

    const notifications: AdminNotificationRecord[] = [];
    notifsSnap.forEach((d) => {
      const raw = d.data();
      notifications.push({
        id: d.id,
        title: String(raw.title || ''),
        message: String(raw.message || ''),
        audience: raw.audience === 'free' || raw.audience === 'premium' ? raw.audience : 'all',
        active: Boolean(raw.active),
        createdAt: toIsoString(raw.createdAt),
      });
    });

    if (!cfgSnap.exists()) {
      return {
        maintenanceMode: false,
        appStatus: 'operational',
        announcementEnabled: false,
        announcementMessage: '',
        aiToolsEnabled: true,
        adGateEnabled: true,
        notifications,
      };
    }

    const c = cfgSnap.data();
    return {
      maintenanceMode: Boolean(c.maintenanceMode),
      appStatus:
        c.appStatus === 'degraded' || c.appStatus === 'maintenance' ? c.appStatus : 'operational',
      announcementEnabled: Boolean(c.announcementEnabled),
      announcementMessage: String(c.announcementMessage || ''),
      aiToolsEnabled: c.aiToolsEnabled !== false,
      adGateEnabled: c.adGateEnabled !== false,
      notifications,
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Admin Firestore Read / Write Helpers
// ---------------------------------------------------------------------------
export interface AdminFirestoreDataset {
  users: AdminUserRecord[];
  transactions: AdminTransactionRecord[];
  notifications: AdminNotificationRecord[];
  appConfig: AdminAppConfig | null;
  adReports: Array<{
    dateKey: string;
    adRevenueUsd: number;
    adImpressions: number;
    adClicks: number;
  }>;
}

export async function fetchAdminFirestoreDataset(): Promise<AdminFirestoreDataset> {
  const users: AdminUserRecord[] = [];
  const transactions: AdminTransactionRecord[] = [];
  const notifications: AdminNotificationRecord[] = [];
  const adReports: AdminFirestoreDataset['adReports'] = [];
  let appConfig: AdminAppConfig | null = null;

  try {
    const usersSnap = await getDocs(collection(db, 'users'));
    for (const userDoc of usersSnap.docs) {
      const d = userDoc.data();
      let email = '';
      try {
        const privSnap = await getDoc(doc(db, 'users', userDoc.id, 'private', 'info'));
        if (privSnap.exists()) {
          email = String(privSnap.data().email || '');
        }
      } catch {
        // ignore missing private doc
      }

      const recentActivity: AdminUserActivityItem[] = [];
      try {
        const actSnap = await getDocs(
          query(
            collection(db, 'users', userDoc.id, 'activity'),
            orderBy('timestamp', 'desc'),
            limit(10)
          )
        );
        actSnap.forEach((a) => {
          const ad = a.data();
          recentActivity.push({
            action: String(ad.action || ''),
            timestamp: toIsoString(ad.timestamp),
          });
        });
      } catch {
        // ignore empty activity
      }

      users.push({
        id: userDoc.id,
        name: String(d.displayName || 'User'),
        email: email || `${userDoc.id}@firebase`,
        registeredAt: toIsoString(d.registeredAt),
        lastActiveAt: toIsoString(d.lastActiveAt),
        subscriptionPlan:
          d.subscriptionPlan === 'monthly' || d.subscriptionPlan === 'annual'
            ? d.subscriptionPlan
            : 'free',
        subscriptionStatus:
          d.subscriptionStatus === 'active' ||
          d.subscriptionStatus === 'expired' ||
          d.subscriptionStatus === 'cancelled'
            ? d.subscriptionStatus
            : 'none',
        status: d.status === 'suspended' ? 'suspended' : 'active',
        inspectionCount: Number(d.inspectionCount || 0),
        aiToolRuns: Number(d.aiToolRuns || 0),
        deviceType:
          d.deviceType === 'Desktop' || d.deviceType === 'Mobile' || d.deviceType === 'Tablet'
            ? d.deviceType
            : 'Unknown',
        recentActivity,
      });
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'users');
  }

  try {
    const txSnap = await getDocs(
      query(collection(db, 'transactions'), orderBy('createdAt', 'desc'), limit(200))
    );
    txSnap.forEach((d) => {
      const raw = d.data();
      const refund = String(raw.refundStatus || 'none');
      const status: AdminTransactionRecord['status'] =
        refund === 'full'
          ? 'refunded'
          : raw.paymentStatus === 'failed'
            ? 'failed'
            : 'completed';
      transactions.push({
        id: d.id,
        userId: String(raw.uid || ''),
        userName: String(raw.userName || 'User'),
        amountUsd: Number(
          raw.currency === 'INR' ? Number(raw.amount || 0) / 84 : Number(raw.amount || 0)
        ),
        paymentMethod: String(raw.paymentMethod || 'Razorpay'),
        plan: raw.subscriptionType === 'annual' ? 'annual' : 'monthly',
        date: toIsoString(raw.createdAt),
        status,
        source: 'gateway',
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'transactions');
  }

  try {
    const notifSnap = await getDocs(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50))
    );
    notifSnap.forEach((d) => {
      const raw = d.data();
      notifications.push({
        id: d.id,
        title: String(raw.title || ''),
        message: String(raw.message || ''),
        audience: raw.audience === 'free' || raw.audience === 'premium' ? raw.audience : 'all',
        active: Boolean(raw.active),
        createdAt: toIsoString(raw.createdAt),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'notifications');
  }

  try {
    const cfgSnap = await getDoc(doc(db, 'appConfig', 'public'));
    if (cfgSnap.exists()) {
      const c = cfgSnap.data();
      appConfig = {
        maintenanceMode: Boolean(c.maintenanceMode),
        appStatus:
          c.appStatus === 'degraded' || c.appStatus === 'maintenance'
            ? c.appStatus
            : 'operational',
        announcementEnabled: Boolean(c.announcementEnabled),
        announcementMessage: String(c.announcementMessage || ''),
        aiToolsEnabled: c.aiToolsEnabled !== false,
        adGateEnabled: c.adGateEnabled !== false,
        dailyFreeInspectLimit: Number(c.dailyFreeInspectLimit || 25),
        updatedAt: toIsoString(c.updatedAt),
      };
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'appConfig/public');
  }

  try {
    const revSnap = await getDocs(collection(db, 'revenueDaily'));
    revSnap.forEach((d) => {
      const r = d.data();
      adReports.push({
        dateKey: String(r.dateKey || d.id),
        adRevenueUsd: Number(r.adRevenueUsd || 0),
        adImpressions: Number(r.adImpressions || 0),
        adClicks: Number(r.adClicks || 0),
      });
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'revenueDaily');
  }

  return { users, transactions, notifications, appConfig, adReports };
}

export async function adminSyncServerLedgerToFirestore(
  transactions: VerifiedTransactionEntry[],
  subscriptions: VerifiedSubscriptionEntry[]
): Promise<void> {
  // Mirrors server-verified Razorpay records into Firestore under authenticated admin authority
  for (const txn of transactions) {
    const ref = doc(db, 'transactions', txn.id);
    const path = `transactions/${txn.id}`;
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          uid: txn.uid,
          userName: txn.userName.slice(0, 80),
          orderId: txn.orderId,
          paymentId: txn.paymentId,
          amount: txn.amount,
          currency: txn.currency,
          paymentMethod: txn.paymentMethod.slice(0, 64),
          subscriptionType: txn.subscriptionType,
          paymentStatus: txn.paymentStatus,
          refundStatus: txn.refundStatus,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (
        snap.data().refundStatus !== txn.refundStatus ||
        snap.data().paymentStatus !== txn.paymentStatus
      ) {
        await updateDoc(ref, {
          paymentStatus: txn.paymentStatus,
          refundStatus: txn.refundStatus,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }

  for (const sub of subscriptions) {
    const subRef = doc(db, 'subscriptions', sub.id);
    const subPath = `subscriptions/${sub.id}`;
    try {
      const snap = await getDoc(subRef);
      if (!snap.exists()) {
        await setDoc(subRef, {
          uid: sub.uid,
          plan: sub.plan,
          status: sub.status,
          provider: sub.provider,
          razorpayOrderId: sub.razorpayOrderId,
          razorpayPaymentId: sub.razorpayPaymentId,
          amount: sub.amount,
          currency: sub.currency,
          startedAt: Timestamp.fromDate(new Date(sub.startedAt)),
          expiresAt: Timestamp.fromDate(new Date(sub.expiresAt)),
          updatedAt: serverTimestamp(),
        });
      }

      // Sync verified subscription status onto the user's profile doc
      const userRef = doc(db, 'users', sub.uid);
      const userSnap = await getDoc(userRef);
      if (
        userSnap.exists() &&
        (userSnap.data().subscriptionPlan !== sub.plan ||
          userSnap.data().subscriptionStatus !== sub.status)
      ) {
        await updateDoc(userRef, {
          subscriptionPlan: sub.plan,
          subscriptionStatus: sub.status,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, subPath);
    }
  }
}

export async function adminUpdateUserStatusInFirestore(
  userId: string,
  status: 'active' | 'suspended'
): Promise<void> {
  const path = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      status,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminSaveAppConfigInFirestore(
  config: Omit<AdminAppConfig, 'updatedAt'>
): Promise<void> {
  const path = 'appConfig/public';
  const ref = doc(db, 'appConfig', 'public');
  try {
    const snap = await getDoc(ref);
    const payload = {
      maintenanceMode: config.maintenanceMode,
      appStatus: config.maintenanceMode ? 'maintenance' : config.appStatus,
      announcementEnabled: config.announcementEnabled,
      announcementMessage: config.announcementMessage.slice(0, 280),
      aiToolsEnabled: config.aiToolsEnabled,
      adGateEnabled: config.adGateEnabled,
      dailyFreeInspectLimit: Math.max(1, Math.min(500, Math.round(config.dailyFreeInspectLimit))),
      updatedAt: serverTimestamp(),
    };
    if (snap.exists()) {
      await updateDoc(ref, payload);
    } else {
      await setDoc(ref, payload);
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function adminCreateNotificationInFirestore(
  id: string,
  payload: { title: string; message: string; audience: 'all' | 'free' | 'premium' }
): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await setDoc(doc(db, 'notifications', id), {
      title: payload.title.slice(0, 100),
      message: payload.message.slice(0, 280),
      audience: payload.audience,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function adminToggleNotificationInFirestore(
  id: string,
  active: boolean
): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await updateDoc(doc(db, 'notifications', id), {
      active,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function adminDeleteNotificationInFirestore(id: string): Promise<void> {
  const path = `notifications/${id}`;
  try {
    await deleteDoc(doc(db, 'notifications', id));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
