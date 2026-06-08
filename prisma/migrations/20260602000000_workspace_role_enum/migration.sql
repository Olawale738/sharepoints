-- Add new LETW workspace roles while preserving legacy editor/viewer values.
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'leader';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'moderator';
ALTER TYPE "WorkspaceRole" ADD VALUE IF NOT EXISTS 'user';
