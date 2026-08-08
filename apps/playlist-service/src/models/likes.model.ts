import mongoose, { type Document, type Model, Schema } from 'mongoose';

export interface ILike extends Document {
  userId: string;
  trackId: string;
  createdAt: Date;
}

const LikeSchema = new Schema<ILike>(
  {
    userId:  { type: String, required: true },
    trackId: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        const r = ret as Record<string, unknown>;
        r['id'] = r['_id'];
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete r['_id'];
        return ret;
      },
    },
  }
);

LikeSchema.index({ userId: 1, trackId: 1 }, { unique: true });
LikeSchema.index({ userId: 1, createdAt: -1 });

export const Like: Model<ILike> = mongoose.model<ILike>('Like', LikeSchema);
