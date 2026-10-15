import mongoose from 'mongoose';
import path from 'node:path';
import { CATEGORIES, STATUSES, WARDS } from './config.js';

const { Schema, model } = mongoose;

const userSchema = new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: String,
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['citizen', 'official', 'worker'], default: 'citizen' },
  department: String,          // officials + workers
  ward: { type: String, enum: WARDS },
}, { timestamps: true });

userSchema.set('toJSON', {
  transform: (_doc, o) => { delete o.passwordHash; delete o.__v; return o; },
});

const reportSchema = new Schema({
  complaintId: { type: String, unique: true, index: true },
  reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  category: { type: String, enum: Object.keys(CATEGORIES), required: true, index: true },
  description: { type: String, required: true, maxlength: 1000 },
  imageUrl: String,
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], required: true },   // [lng, lat]
  },
  address: String,
  ward: { type: String, enum: WARDS, index: true },
  severity: { type: Number, min: 1, max: 5, default: 3 },
  priorityScore: { type: Number, default: 0, index: true },
  priorityLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Low' },
  priorityBreakdown: { type: Object, default: {} },
  department: { type: String, index: true },
  assignedWorker: { type: Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: STATUSES, default: 'SUBMITTED', index: true },
  supporters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  slaDeadline: Date,
  overdue: { type: Boolean, default: false, index: true },
  resolutionImageUrl: String,
  resolutionNote: String,
  rejectionReason: String,
  timeline: [{
    status: String,
    at: { type: Date, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    note: String,
  }],
  resolvedAt: Date,
}, { timestamps: true });

reportSchema.index({ location: '2dsphere' });

const departmentSchema = new Schema({
  name: { type: String, required: true, unique: true },
  categories: [String],
  defaultSlaHours: { type: Number, default: 48 },
});

const notificationSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  report: { type: Schema.Types.ObjectId, ref: 'Report' },
  complaintId: String,
  title: String,
  message: String,
  type: { type: String, default: 'info' },
  read: { type: Boolean, default: false },
}, { timestamps: true });

export const User = model('User', userSchema);
export const Report = model('Report', reportSchema);
export const Department = model('Department', departmentSchema);
export const Notification = model('Notification', notificationSchema);

let memoryServer;

export async function connect() {
  let uri = process.env.MONGO_URI;
  if (!uri) {
    // Zero-setup demo path: spin up an in-process mongod (supports 2dsphere).
    // Pin the binary cache to this folder, otherwise it is resolved from the
    // caller's cwd and re-downloaded once per launcher.
    process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(import.meta.dirname, 'node_modules/.cache/mongodb-memory-server');
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('civic');
    console.log('MONGO_URI not set - started in-memory MongoDB (data resets on restart)');
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
  return uri;
}

export async function disconnect() {
  await mongoose.disconnect();
  await memoryServer?.stop();
}

export async function notify(user, report, title, message, type = 'info') {
  if (!user) return;
  return Notification.create({
    user, report: report?._id, complaintId: report?.complaintId, title, message, type,
  });
}
