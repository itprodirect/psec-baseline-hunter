/**
 * User Profile Types for Personalized Explanations
 * Used to tailor security summaries to the user's context and technical level
 */

/**
 * Technical proficiency levels
 */
export type TechnicalLevel = "non-technical" | "some-technical" | "technical" | "security-professional";

/**
 * User profession/role categories
 */
export type Profession =
  | "small-business-owner"
  | "attorney"
  | "healthcare"
  | "educator"
  | "parent-home-user"
  | "nonprofit"
  | "real-estate"
  | "financial"
  | "executive"
  | "it-staff"
  | "other";

/**
 * Context factors that affect risk interpretation
 */
export type ContextFactor =
  | "works-from-home"
  | "handles-client-data"
  | "handles-financial-data"
  | "handles-health-records"
  | "children-at-home"
  | "smart-home-devices"
  | "accepts-payments"
  | "regulatory-requirements"
  | "remote-employees";

/**
 * Tone preferences for explanations
 */
export type ExplanationTone = "reassuring" | "direct" | "urgent" | "educational";

/**
 * Complete user profile for personalized explanations
 */
export interface UserProfile {
  technicalLevel: TechnicalLevel;
  profession: Profession;
  contextFactors: ContextFactor[];
  tone: ExplanationTone;
  /** Whether to include actual IPs/hostnames in the LLM prompt (default: false) */
  includeNetworkDetails: boolean;
}

/**
 * Default user profile
 */
export const DEFAULT_USER_PROFILE: UserProfile = {
  technicalLevel: "non-technical",
  profession: "small-business-owner",
  contextFactors: [],
  tone: "direct",
  includeNetworkDetails: false,
};

/**
 * Labels for technical levels
 */
export const TECHNICAL_LEVEL_LABELS: Record<TechnicalLevel, { label: string; description: string }> = {
  "non-technical": {
    label: "Not Technical",
    description: "Explain like I'm not in IT - plain English only",
  },
  "some-technical": {
    label: "Somewhat Technical",
    description: "I understand basics but not security jargon",
  },
  "technical": {
    label: "Technical",
    description: "I work with computers but security isn't my specialty",
  },
  "security-professional": {
    label: "Security Professional",
    description: "Give me the technical details",
  },
};

/**
 * Labels for professions
 */
export const PROFESSION_LABELS: Record<Profession, { label: string; description: string }> = {
  "small-business-owner": {
    label: "Small Business Owner",
    description: "Running a business with <50 employees",
  },
  "attorney": {
    label: "Attorney / Law Firm",
    description: "Legal practice handling client matters",
  },
  "healthcare": {
    label: "Healthcare Provider",
    description: "Medical practice or healthcare facility",
  },
  "educator": {
    label: "Educator / School",
    description: "Educational institution or teaching",
  },
  "parent-home-user": {
    label: "Parent / Home User",
    description: "Home network with family members",
  },
  "nonprofit": {
    label: "Nonprofit Organization",
    description: "Charitable or nonprofit entity",
  },
  "real-estate": {
    label: "Real Estate",
    description: "Real estate agency or property management",
  },
  "financial": {
    label: "Financial Services",
    description: "Accounting, financial planning, banking",
  },
  "executive": {
    label: "Executive / C-Suite",
    description: "Senior leadership needing board-level view",
  },
  "it-staff": {
    label: "IT Staff",
    description: "Internal IT team member",
  },
  "other": {
    label: "Other",
    description: "None of the above",
  },
};

/**
 * Labels for context factors
 */
export const CONTEXT_FACTOR_LABELS: Record<ContextFactor, { label: string; description: string }> = {
  "works-from-home": {
    label: "Work from Home",
    description: "Remote workers access company resources",
  },
  "handles-client-data": {
    label: "Client Data",
    description: "Store or process client/customer information",
  },
  "handles-financial-data": {
    label: "Financial Data",
    description: "Handle banking, payments, or financial records",
  },
  "handles-health-records": {
    label: "Health Records (HIPAA)",
    description: "Store or process protected health information",
  },
  "children-at-home": {
    label: "Children at Home",
    description: "Kids use devices on this network",
  },
  "smart-home-devices": {
    label: "Smart Home / IoT",
    description: "Connected devices (cameras, thermostats, etc.)",
  },
  "accepts-payments": {
    label: "Accept Payments (PCI)",
    description: "Process credit cards or online payments",
  },
  "regulatory-requirements": {
    label: "Regulatory Requirements",
    description: "Subject to compliance (SOX, GDPR, etc.)",
  },
  "remote-employees": {
    label: "Remote Employees",
    description: "Staff connect from outside the office",
  },
};

/**
 * Labels for tone preferences
 */
export const TONE_LABELS: Record<ExplanationTone, { label: string; description: string }> = {
  "reassuring": {
    label: "Reassuring",
    description: "Focus on what's going well and actionable steps",
  },
  "direct": {
    label: "Direct",
    description: "Straightforward facts without sugar-coating",
  },
  "urgent": {
    label: "Urgent",
    description: "Emphasize risks and immediate priorities",
  },
  "educational": {
    label: "Educational",
    description: "Explain the 'why' behind each recommendation",
  },
};

/**
 * Redacted placeholder for sensitive data
 */
export const REDACTED_PLACEHOLDER = "[REDACTED]";

/**
 * LocalStorage key for user profile
 */
export const USER_PROFILE_STORAGE_KEY = "psec-user-profile";
