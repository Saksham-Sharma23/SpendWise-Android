import { toast } from 'sonner-native';

import type { WriteResult } from '@/lib/db/safeWrite';

/**
 * "Rahul removed · Undo". Deletes in Groups are soft (CLAUDE.md #10), so Undo
 * puts back the original row rather than re-creating a lookalike. If the undo
 * itself is refused (someone has since left the group, B14), safeWrite toasts
 * why.
 */
export function toastWithUndo(message: string, undo: () => WriteResult<unknown>): void {
  toast.success(message, { action: { label: 'Undo', onClick: () => void undo() } });
}
