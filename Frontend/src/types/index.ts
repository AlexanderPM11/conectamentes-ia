export type Mode = 'welcome' | 'login' | 'register' | 'recover';
export type Tab = 'inicio' | 'perfil' | 'solicitudes' | 'tutor' | 'coincidencias' | 'mensajes' | 'ranking' | 'agenda' | 'seguridad' | 'panel' | 'admin';
export type IconName = 'home' | 'profile' | 'request' | 'tutor' | 'match' | 'message' | 'bell' | 'search' | 'calendar' | 'shield' | 'chart' | 'star' | 'more' | 'back';

export interface User {
  id: string;
  email: string;
  displayName: string;
  career?: string;
  academicTerm?: string;
  roles?: string[];
  avatarUpdatedAt?: string;
}

export interface SkillProfile {
  id: string;
  topic: string;
  type: string;
  confidence: number;
  visible: boolean;
}

export interface Availability {
  timeSlots: string;
  preferredMode: string;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  referenceId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Request {
  id: string;
  topic: string;
  description: string;
  helpType: string;
  desiredSchedule: string;
  status: string;
  createdAt: string;
}

export interface Connection {
  id: string;
  requestId: string;
  topic: string;
  status: string;
  counterpartId: string;
  counterpart: string;
  requiresMyResponse: boolean;
}

export interface Session {
  id: string;
  connectionId: string;
  date: string;
  durationMinutes: number;
  mode: string;
  objective: string;
  guide: string;
  meetUrl?: string;
  status: string;
  topic: string;
  counterpartId: string;
  counterpart: string;
  isRequester: boolean;
  hasRated: boolean;
  canRate: boolean;
}

export interface ChatMessage {
  id: string;
  connectionId: string;
  senderId: string;
  sender: string;
  text: string;
  createdAt: string;
  isMine: boolean;
  attachment?: {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
  };
}
