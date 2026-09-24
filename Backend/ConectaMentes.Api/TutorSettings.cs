namespace ConectaMentes.Api;

public sealed class TutorSettings
{
    public int FreeMessageLimit { get; init; }
    public int PremiumMessageLimit { get; init; }
    public int TrialDays { get; init; }
    public int UsagePeriodDays { get; init; }
    public string AiEndpoint { get; init; } = "";
    public string AiApiKey { get; init; } = "";
    public string AiSystemPrompt { get; init; } = "";
    public string AiFallbackMessage { get; init; } = "";
    public string[] SafetyTerms { get; init; } = [];
    public int AiTimeoutSeconds { get; init; }
    public double AiTemperature { get; init; }
    public int AiMaxTokens { get; init; }
    public string JevEndpoint { get; init; } = "";
    public string JevApiKey { get; init; } = "";
    public int JevTimeoutSeconds { get; init; }
    public string[] JevPriorities { get; init; } = [];
    public string[] JevConstraints { get; init; } = [];
    public string JevStakes { get; init; } = "";
    public int RouterLongTaskChars { get; init; }
    public string[] RouterComplexityTerms { get; init; } = [];
    public string ModelFast { get; init; } = "";
    public string ModelFastDescription { get; init; } = "";
    public string ModelFastCost { get; init; } = "";
    public string ModelFastLatency { get; init; } = "";
    public string ModelFastContext { get; init; } = "";
    public string ModelReasoning { get; init; } = "";
    public string ModelReasoningDescription { get; init; } = "";
    public string ModelReasoningCost { get; init; } = "";
    public string ModelReasoningLatency { get; init; } = "";
    public string ModelReasoningContext { get; init; } = "";
    public string ModelLongContext { get; init; } = "";
    public string ModelLongDescription { get; init; } = "";
    public string ModelLongCost { get; init; } = "";
    public string ModelLongLatency { get; init; } = "";
    public string ModelLongContextWindow { get; init; } = "";

    public static TutorSettings Load(IConfiguration configuration) => new()
    {
        FreeMessageLimit = Int(configuration, "TUTOR_FREE_MESSAGE_LIMIT", "Tutor:FreeMessageLimit", 15),
        PremiumMessageLimit = Int(configuration, "TUTOR_PREMIUM_MESSAGE_LIMIT", "Tutor:PremiumMessageLimit", 2000),
        TrialDays = Int(configuration, "TUTOR_TRIAL_DAYS", "Tutor:TrialDays", 7),
        UsagePeriodDays = Int(configuration, "TUTOR_USAGE_PERIOD_DAYS", "Tutor:UsagePeriodDays", 30),
        AiEndpoint = Text(configuration, "AI_ENDPOINT", "Tutor:AiEndpoint", "https://api.openai.com/v1/chat/completions"),
        AiApiKey = Text(configuration, "AI_API_KEY", "Tutor:AiApiKey", configuration["OPENAI_API_KEY"] ?? configuration["GROQ_API_KEY"] ?? configuration["MINIMAX_API_KEY"] ?? ""),
        AiSystemPrompt = Text(configuration, "AI_SYSTEM_PROMPT", "Tutor:AiSystemPrompt", "Eres el Tutor IA de ConectaMentes. Enseña {subject} en español, con claridad y preguntas de comprobación. Modo: {mode}. No hagas tareas, exámenes o proyectos completos. Guía el razonamiento y adapta la explicación al nivel del estudiante."),
        AiFallbackMessage = Text(configuration, "TUTOR_AI_FALLBACK_MESSAGE", "Tutor:AiFallbackMessage", "Vamos a trabajar **{subject}**. Primero, dime qué parte ya entiendes y cuál te confunde. Después te daré una pista, un ejemplo y una pregunta corta para comprobar tu comprensión."),
        SafetyTerms = Csv(configuration, "TUTOR_SAFETY_TERMS", "Tutor:SafetyTerms", "examen,copiar,hazme la tarea,resuelve todo"),
        AiTimeoutSeconds = Int(configuration, "TUTOR_AI_TIMEOUT_SECONDS", "Tutor:AiTimeoutSeconds", 30),
        AiTemperature = Double(configuration, "TUTOR_AI_TEMPERATURE", "Tutor:AiTemperature", 0.35),
        AiMaxTokens = Int(configuration, "TUTOR_AI_MAX_TOKENS", "Tutor:AiMaxTokens", 700),
        JevEndpoint = Text(configuration, "JEV_ENDPOINT", "Jev:Endpoint", "https://www.jevai.org/api/v1/decisions/model-route"),
        JevApiKey = Text(configuration, "JEV_API_KEY", "Jev:ApiKey", ""),
        JevTimeoutSeconds = Int(configuration, "JEV_TIMEOUT_SECONDS", "Jev:TimeoutSeconds", 4),
        JevPriorities = Csv(configuration, "JEV_PRIORITIES", "Jev:Priorities", "quality,context,latency,cost"),
        JevConstraints = Csv(configuration, "JEV_CONSTRAINTS", "Jev:Constraints", "Use only a configured candidate.,Keep the selected model compatible with the configured text provider."),
        JevStakes = Text(configuration, "JEV_STAKES", "Jev:Stakes", "medium"),
        RouterLongTaskChars = Int(configuration, "AI_ROUTER_LONG_TASK_CHARS", "Tutor:RouterLongTaskChars", 900),
        RouterComplexityTerms = Csv(configuration, "AI_ROUTER_COMPLEXITY_TERMS", "Tutor:RouterComplexityTerms", "demuestra,compara,deriva"),
        ModelFast = Text(configuration, "AI_MODEL_FAST", "Tutor:ModelFast", Text(configuration, "AI_MODEL", "Tutor:ModelFastFallback", "gpt-4o-mini")),
        ModelFastDescription = Text(configuration, "AI_MODEL_FAST_DESCRIPTION", "Tutor:ModelFastDescription", "Fast general tutor for short explanations, simple practice and low latency."),
        ModelFastCost = Text(configuration, "AI_MODEL_FAST_COST", "Tutor:ModelFastCost", "low"),
        ModelFastLatency = Text(configuration, "AI_MODEL_FAST_LATENCY", "Tutor:ModelFastLatency", "low"),
        ModelFastContext = Text(configuration, "AI_MODEL_FAST_CONTEXT", "Tutor:ModelFastContext", "32k"),
        ModelReasoning = Text(configuration, "AI_MODEL_REASONING", "Tutor:ModelReasoning", "gpt-4o"),
        ModelReasoningDescription = Text(configuration, "AI_MODEL_REASONING_DESCRIPTION", "Tutor:ModelReasoningDescription", "Stronger reasoning tutor for difficult university concepts and multi-step problems."),
        ModelReasoningCost = Text(configuration, "AI_MODEL_REASONING_COST", "Tutor:ModelReasoningCost", "medium"),
        ModelReasoningLatency = Text(configuration, "AI_MODEL_REASONING_LATENCY", "Tutor:ModelReasoningLatency", "medium"),
        ModelReasoningContext = Text(configuration, "AI_MODEL_REASONING_CONTEXT", "Tutor:ModelReasoningContext", "128k"),
        ModelLongContext = Text(configuration, "AI_MODEL_LONG_CONTEXT", "Tutor:ModelLongContext", ""),
        ModelLongDescription = Text(configuration, "AI_MODEL_LONG_CONTEXT_DESCRIPTION", "Tutor:ModelLongDescription", "Long-context tutor for extended study material and conversation history."),
        ModelLongCost = Text(configuration, "AI_MODEL_LONG_CONTEXT_COST", "Tutor:ModelLongContextCost", "high"),
        ModelLongLatency = Text(configuration, "AI_MODEL_LONG_CONTEXT_LATENCY", "Tutor:ModelLongContextLatency", "medium"),
        ModelLongContextWindow = Text(configuration, "AI_MODEL_LONG_CONTEXT_WINDOW", "Tutor:ModelLongContextWindow", "200k")
    };

    private static string Text(IConfiguration c, string env, string key, string fallback) => c[env] ?? Environment.GetEnvironmentVariable(env) ?? c[key] ?? fallback;
    private static int Int(IConfiguration c, string env, string key, int fallback) => int.TryParse(Text(c, env, key, fallback.ToString()), out var value) ? value : fallback;
    private static double Double(IConfiguration c, string env, string key, double fallback) => double.TryParse(Text(c, env, key, fallback.ToString(System.Globalization.CultureInfo.InvariantCulture)), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
    private static string[] Csv(IConfiguration c, string env, string key, string fallback) => Text(c, env, key, fallback).Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
}
