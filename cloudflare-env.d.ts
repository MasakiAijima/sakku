declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    AI_PROVIDER?: string;
    OPENAI_API_KEY?: string;
    GROQ_API_KEY?: string;
    HAIKU_MODEL?: string;
    HAIKU_USER_DAILY_LIMIT?: string;
    HAIKU_SERVICE_DAILY_LIMIT?: string;
    HAIKU_SERVICE_DAILY_TOKEN_LIMIT?: string;
    HAIKU_MAX_OUTPUT_TOKENS?: string;
    HAIKU_PAID_MODE?: string;
    HAIKU_DAILY_BUDGET_MICRO_USD?: string;
    HAIKU_RESERVE_MICRO_USD?: string;
  }
}
