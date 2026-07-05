export type HealthStatus = {
  ollama: { ok: boolean; models: string[]; error?: string };
  network: { externalRequests: number; recentHosts: string[] };
  resources: ResourceSnapshot;
  demoRoot: string;
};

export type ResourceSnapshot = {
  cpuLoad: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  platform: string;
  gpu?: string;
};

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };
export type ChatResult = {
  text: string;
  mode: 'ollama' | 'demo-fallback';
  model: string;
  tokensPerSecond?: number;
  startedAt: number;
  finishedAt: number;
};

export type Artifact = { name: string; path: string; type: 'pdf' | 'docx' | 'md' | 'html' | 'zip' | 'json' | 'csv' | 'ics' };
export type MissionResult = {
  summary: string;
  artifacts: Artifact[];
  trace: MissionTraceItem[];
  privacy: PrivacyEvent[];
};

export type MissionTraceItem = { time: string; title: string; detail: string };
export type PrivacyEvent = { time: string; action: string; target: string; detail: string };

export type FilePlan = {
  missionId: string;
  root: string;
  moves: { from: string; to: string; reason: string }[];
  creates: string[];
  risk: 'low' | 'medium' | 'high';
};

export type AutomationResult = {
  missionId: string;
  manifestPath: string;
  moved: number;
  created: number;
};


export type LunaSkill = {
  id: string;
  name: string;
  description: string;
  category: 'study' | 'invoice' | 'meeting' | 'research' | 'job' | 'generic';
  inputs: { name: string; type: 'file' | 'folder' | 'text' | 'demo'; accept?: string[]; description: string }[];
  permissions: string[];
  steps: { tool: string; label: string; detail: string }[];
  outputs: { name: string; type: 'pdf' | 'docx' | 'md' | 'html' | 'zip' | 'json' | 'csv' | 'ics' | 'csv' | 'ics' }[];
  createdAt: string;
};

export type SkillRunResult = {
  skill: LunaSkill;
  artifacts: Artifact[];
  trace: MissionTraceItem[];
  privacy: PrivacyEvent[];
};


export type VaultDoc = {
  id: string;
  name: string;
  path: string;
  type: string;
  addedAt: string;
  chars: number;
};

export type VaultChunk = {
  id: string;
  docId: string;
  docName: string;
  text: string;
  index: number;
  embedding?: number[];
  keywords: Record<string, number>;
};

export type VaultState = {
  docs: VaultDoc[];
  chunks: VaultChunk[];
  updatedAt: string;
};

export type VaultSearchResult = {
  chunk: VaultChunk;
  score: number;
  reasons: string[];
};

export type VaultAnswer = {
  answer: string;
  results: VaultSearchResult[];
  mode: 'ollama' | 'demo-fallback';
  model: string;
};


export type MemoryItem = {
  id: string;
  type: 'preference' | 'project' | 'goal' | 'fact' | 'workflow' | 'conversation';
  text: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  embedding?: number[];
  keywords: Record<string, number>;
};

export type MemoryState = {
  items: MemoryItem[];
  updatedAt: string;
};

export type MemorySearchResult = {
  memory: MemoryItem;
  score: number;
  reasons: string[];
};

export type ContextBuildResult = {
  prompt: string;
  memories: MemorySearchResult[];
  vault: VaultSearchResult[];
  desktopContext: string;
};

export type ConversationCompressionResult = {
  created: boolean;
  memory?: MemoryItem;
  summary?: string;
};


export type ModelBenchmarkResult = {
  model: string;
  ok: boolean;
  mode: 'ollama' | 'demo-fallback';
  latencyMs: number;
  tokensPerSecond?: number;
  outputPreview: string;
  error?: string;
};

export type ModelRecommendation = {
  recommended: string;
  reason: string;
  systemClass: 'low' | 'balanced' | 'high';
  installedUsable: string[];
  missingSuggested: string[];
};

export type FallbackDrillResult = {
  ok: boolean;
  primaryStatus: string;
  fallbackStatus: string;
  response: ChatResult;
};


export type LensSnapshot = {
  id: string;
  capturedAt: string;
  mode: 'desktop-context' | 'manual-image' | 'manual-text';
  activeWindow?: { title?: string; owner?: string; app?: string };
  runningApps: string[];
  sourcePath?: string;
  ocrText?: string;
  summary?: string;
  privacy: PrivacyEvent[];
};


export type CommandRouteResult = {
  intent: string;
  confidence: number;
  summary: string;
  actionTaken: string;
  artifacts?: Artifact[];
  trace?: MissionTraceItem[];
  privacy?: PrivacyEvent[];
  plan?: FilePlan;
  extra?: unknown;
};


export type AuditEvent = {
  id: string;
  time: string;
  category: 'network' | 'file' | 'ai' | 'artifact' | 'memory' | 'automation' | 'skill' | 'vault' | 'lens' | 'model' | 'system';
  action: string;
  target: string;
  detail: string;
  risk?: 'low' | 'medium' | 'high';
};

export type TrustExportResult = {
  path: string;
  files: string[];
};


export type AttachmentItem = {
  id: string;
  name: string;
  originalPath: string;
  storedPath: string;
  type: string;
  addedAt: string;
  chars: number;
  textPreview: string;
};

export type AttachmentState = {
  items: AttachmentItem[];
  updatedAt: string;
};


export type MissionTemplate = {
  id: 'meeting' | 'invoice' | 'study' | 'codebase';
  title: string;
  description: string;
  outputs: string[];
};


export type LunaSettings = {
  userName: string;
  assistantName: string;
  theme: 'midnight' | 'aurora' | 'light';
  accent: 'purple' | 'cyan' | 'green';
  preferredModel: string;
  responseStyle: 'concise' | 'balanced' | 'detailed';
  memoryEnabled: boolean;
  voiceEnabled: boolean;
  privacyMode: 'strict' | 'balanced';
  onboardingComplete: boolean;
  updatedAt: string;
};


export type DatabaseStatus = {
  path: string;
  ok: boolean;
  tables: { name: string; rows: number }[];
  sizeBytes: number;
};
