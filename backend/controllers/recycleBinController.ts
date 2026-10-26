import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import RecycleBin from '../models/RecycleBin';

// @desc    Get all items in Recycle Bin
// @route   GET /bin
// @access  Private (Admin, Sub Admin)
export const getBinItems = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entityType, search, emailOnly, status } = req.query;

    const items = await RecycleBin.getAll({
      entityType: entityType ? String(entityType) : undefined,
      search: search ? String(search) : undefined,
      emailOnly: emailOnly === 'true',
      status: (status as any) || 'in_bin',
    });

    res.json(items);
  } catch (error: any) {
    console.error('Get bin items error:', error.message);
    res.status(500).json({ message: 'Failed to retrieve bin items', error: error.message });
  }
};

// @desc    Get Recycle Bin statistics
// @route   GET /bin/stats
// @access  Private (Admin, Sub Admin)
export const getBinStats = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const items = await RecycleBin.getAll({ status: 'in_bin' });
    const deletedEmails = await RecycleBin.getDeletedEmails();

    const byEntityType: Record<string, number> = {};
    for (const item of items) {
      byEntityType[item.entityType] = (byEntityType[item.entityType] || 0) + 1;
    }

    const heldEmailsCount = deletedEmails.filter((e) => e.emailStatus === 'held').length;
    const releasedEmailsCount = deletedEmails.filter((e) => e.emailStatus === 'released').length;

    res.json({
      total: items.length,
      byEntityType,
      deletedEmailsCount: deletedEmails.length,
      heldEmailsCount,
      releasedEmailsCount,
    });
  } catch (error: any) {
    console.error('Get bin stats error:', error.message);
    res.status(500).json({ message: 'Failed to retrieve bin stats', error: error.message });
  }
};

// @desc    Get all deleted user emails with restoration/release status
// @route   GET /bin/emails
// @access  Private (Admin, Sub Admin)
export const getDeletedEmails = async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const emails = await RecycleBin.getDeletedEmails();
    res.json(emails);
  } catch (error: any) {
    console.error('Get deleted emails error:', error.message);
    res.status(500).json({ message: 'Failed to retrieve deleted emails', error: error.message });
  }
};

// @desc    Check if an email belongs to a deleted user in the bin
// @route   GET /bin/check-email
// @access  Private
export const checkEmailInBin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const email = String(req.query.email || '');
    if (!email) {
      res.status(400).json({ message: 'Email query parameter is required' });
      return;
    }

    const match = await RecycleBin.checkEmailInBin(email);
    if (match) {
      res.json({
        inBin: true,
        binItem: {
          _id: match._id,
          name: match.name,
          email: match.email,
          entityType: match.entityType,
          deletedAt: match.deletedAt,
          emailStatus: match.emailStatus,
        },
      });
    } else {
      res.json({ inBin: false });
    }
  } catch (error: any) {
    console.error('Check email in bin error:', error.message);
    res.status(500).json({ message: 'Failed to check email', error: error.message });
  }
};

// @desc    Restore an item from Recycle Bin
// @route   POST /bin/restore/:id
// @access  Private (Admin, Sub Admin)
export const restoreBinItem = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { newEmail } = req.body;

    const result = await RecycleBin.restoreItem(id as string, { newEmail });
    res.json(result);
  } catch (error: any) {
    console.error('Restore bin item error:', error.message);
    res.status(400).json({ message: error.message || 'Failed to restore item' });
  }
};

// @desc    Release a deleted user's email so it can be reused immediately
// @route   POST /bin/release-email/:id
// @access  Private (Admin, Sub Admin)
export const releaseDeletedEmail = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await RecycleBin.releaseEmail(id as string);
    res.json(result);
  } catch (error: any) {
    console.error('Release email error:', error.message);
    res.status(400).json({ message: error.message || 'Failed to release email' });
  }
};

// @desc    Permanently delete an item from Recycle Bin
// @route   DELETE /bin/:id
// @access  Private (Admin)
export const deleteBinItemPermanently = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await RecycleBin.deletePermanently(id as string);
    res.json(result);
  } catch (error: any) {
    console.error('Permanent delete error:', error.message);
    res.status(400).json({ message: error.message || 'Failed to permanently delete item' });
  }
};

// @desc    Empty Recycle Bin
// @route   DELETE /bin
// @access  Private (Admin)
export const emptyBin = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { entityType } = req.query;
    const result = await RecycleBin.emptyBin(entityType ? String(entityType) : undefined);
    res.json(result);
  } catch (error: any) {
    console.error('Empty bin error:', error.message);
    res.status(500).json({ message: 'Failed to empty bin', error: error.message });
  }
};
