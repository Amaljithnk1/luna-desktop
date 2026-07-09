export {};

declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
    luna: {
      health: () => Promise<any>;
      resetDemo: () => Promise<any>;
      chat: (messages: any[]) => Promise<any>;
      transcribeAudio: (samples: Float32Array | number[]) => Promise<{ text: string }>;
      voiceStatus: () => Promise<{ ready: boolean; cacheDir: string; downloaded: boolean }>;
      runJobMission: () => Promise<any>;
      planCleanup: () => Promise<any>;
      executeCleanup: (plan: any) => Promise<any>;
      undoMission: (missionId: string) => Promise<any>;
      listUndoableActions: () => Promise<{ missionId: string; type: 'delete'|'rename'|'move'|'cleanup'; description: string; createdAt: string }[]>;
      undoAllPending: () => Promise<{ ok: boolean; undone: number; failed: number; message: string }>;
      restoreFromTrash: (missionId: string) => Promise<any>;
      revealPath: (path: string) => Promise<any>;
      openPath: (path: string) => Promise<string>;
      openExternal: (url: string) => Promise<void>;
      getNetworkLog: () => Promise<any>;
      getResources: () => Promise<any>;
      generateSkill: (description: string) => Promise<any>;
      saveSkill: (skill: any) => Promise<any>;
      listSkills: () => Promise<any>;
      runSkill: (skillId: string, inputValues?: Record<string, any>) => Promise<any>;
      openFileDialog: (accept?: string[]) => Promise<string | null>;
      openFolderDialog: () => Promise<string | null>;
      vaultIndexDemo: () => Promise<any>;
      vaultImportFiles: () => Promise<any>;
      vaultState: () => Promise<any>;
      vaultSearch: (query: string) => Promise<any>;
      vaultAsk: (question: string) => Promise<any>;
      memoryList: () => Promise<any>;
      memoryAdd: (text: string, type?: string, source?: string) => Promise<any>;
      memorySearch: (query: string) => Promise<any>;
      memoryDelete: (id: string) => Promise<any>;
      memorySeed: () => Promise<any>;
      contextBuild: (query: string) => Promise<any>;
      chatPlus: (messages: any[]) => Promise<any>;

      runMissionTemplate: (missionId: string) => Promise<any>;
      modelRecommend: () => Promise<any>;
      modelBenchmark: () => Promise<any>;
      fallbackDrill: () => Promise<any>;
      lensContext: () => Promise<any>;
      lensImportImage: () => Promise<any>;
      lensExplain: (snapshot: any) => Promise<any>;
      routeCommand: (command: string) => Promise<any>;
      routeCommandWithContext: (command: string, pending: { intent: 'delete' | 'rename'; candidates: { path: string; name: string }[]; newName?: string } | null) => Promise<any>;
      openMainCommandPalette: () => Promise<any>;
      auditList: () => Promise<any>;
      trustExport: () => Promise<any>;
      dataResetAll: () => Promise<any>;
      attachmentsImport: () => Promise<any>;
      attachmentsList: () => Promise<any>;
      attachmentsClear: () => Promise<any>;
      attachmentsToVault: () => Promise<any>;
      attachmentsSummarize: () => Promise<any>;
      settingsGet: () => Promise<any>;
      settingsSave: (settings: any) => Promise<any>;
      databaseStatus: () => Promise<any>;
      onCommandPalette: (callback: () => void) => () => void;
      chatListSessions: () => Promise<{ id: string; title: string; created_at: string; updated_at: string }[]>;
      chatCreateSession: () => Promise<string>;
      chatGetMessages: (sessionId: string) => Promise<{ id: string; session_id: string; role: string; content: string; meta: string | null; created_at: string }[]>;
      chatAppendMessage: (sessionId: string, role: string, content: string, meta?: string | null) => Promise<{ id: string; session_id: string; role: string; content: string; meta: string | null; created_at: string }>;
      chatRenameSession: (sessionId: string, firstUserMessage: string) => Promise<void>;
      chatDeleteSession: (sessionId: string) => Promise<void>;
    };
  }
}