//! # localbrain
//!
//! Rust client for a [localbrain](https://github.com/kowais915/localbrain) endpoint —
//! free, private, local AI. It just makes HTTP calls to a local, OpenAI-compatible
//! model, so it's a featherweight dependency.
//!
//! ```no_run
//! use localbrain::Client;
//!
//! # async fn demo() -> Result<(), Box<dyn std::error::Error>> {
//! let ai = Client::new(); // reads LOCALBRAIN_URL, defaults to http://localhost:4141/v1
//!
//! let reply = ai.chat("Say hi in five words").await?;
//! let label = ai.classify("the invoice is overdue", &["billing", "support", "sales"]).await?;
//! let vector = ai.embed("find me by meaning").await?;
//! # let _ = (reply, label, vector);
//! # Ok(())
//! # }
//! ```
//!
//! To stand up the endpoint this talks to, run the CLI in your project once:
//! `npx localbrain`.

use serde::de::DeserializeOwned;
use serde_json::{json, Map, Value};

const DEFAULT_BASE_URL: &str = "http://localhost:4141/v1";

/// Errors returned by the client. Each maps to an actionable cause.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    /// Nothing is listening on the endpoint (is `localbrain start` running?).
    #[error("localbrain endpoint not reachable ({0}) — is `localbrain start` running?")]
    EndpointDown(String),
    /// The server is up but the model isn't ready (still loading / not downloaded).
    #[error("model not ready ({0}) — run `localbrain doctor`")]
    ModelNotReady(String),
    /// The request exceeded the configured timeout.
    #[error("request timed out")]
    Timeout,
    /// The endpoint returned a non-OpenAI or otherwise unexpected payload.
    #[error("bad response from endpoint: {0}")]
    BadResponse(String),
    /// `extract`/`classify` output failed to match the requested shape.
    #[error("model did not return valid JSON matching the requested schema")]
    SchemaViolation,
}

/// Convenience result alias.
pub type Result<T> = std::result::Result<T, Error>;

/// Per-call options for [`Client::chat_with`] / [`Client::summarize_with`].
#[derive(Debug, Default, Clone)]
pub struct ChatOptions {
    /// Sampling temperature (0.0–2.0). Lower is more deterministic.
    pub temperature: Option<f32>,
    /// Hard cap on generated tokens.
    pub max_tokens: Option<u32>,
    /// System prompt prepended to the conversation.
    pub system: Option<String>,
    /// Stop sequences that end generation.
    pub stop: Option<Vec<String>>,
}

/// Result of [`Client::health`].
#[derive(Debug, Clone)]
pub struct Health {
    pub ok: bool,
    pub model: Option<String>,
}

/// A client bound to a localbrain endpoint.
#[derive(Debug, Clone)]
pub struct Client {
    http: reqwest::Client,
    base_url: String,
    model: Option<String>,
    embed_model: Option<String>,
}

impl Default for Client {
    fn default() -> Self {
        Self::new()
    }
}

impl Client {
    /// Create a client using `LOCALBRAIN_URL` (or `http://localhost:4141/v1`).
    pub fn new() -> Self {
        Self::builder().build()
    }

    /// Start configuring a client.
    pub fn builder() -> ClientBuilder {
        ClientBuilder::default()
    }

    /// Free-form chat completion.
    pub async fn chat(&self, prompt: &str) -> Result<String> {
        self.chat_with(prompt, &ChatOptions::default()).await
    }

    /// Chat completion with options.
    pub async fn chat_with(&self, prompt: &str, opts: &ChatOptions) -> Result<String> {
        let mut messages = Vec::new();
        if let Some(system) = &opts.system {
            messages.push(json!({ "role": "system", "content": system }));
        }
        messages.push(json!({ "role": "user", "content": prompt }));

        let mut body = Map::new();
        body.insert("messages".into(), Value::Array(messages));
        self.add_common(&mut body, opts);
        let data: Value = self.post("/chat/completions", Value::Object(body)).await?;
        first_content(&data)
    }

    /// Classify `text` into exactly one of `labels` (grammar-constrained).
    pub async fn classify(&self, text: &str, labels: &[&str]) -> Result<String> {
        if labels.is_empty() {
            return Err(Error::SchemaViolation);
        }
        let schema = json!({
            "type": "object",
            "properties": { "label": { "type": "string", "enum": labels } },
            "required": ["label"],
            "additionalProperties": false
        });
        let mut body = Map::new();
        body.insert(
            "messages".into(),
            json!([
                { "role": "system", "content": "You are a precise text classifier. Choose exactly one label." },
                { "role": "user", "content": format!("Classify the following text into one of [{}].\n\nText:\n{}", labels.join(", "), text) }
            ]),
        );
        body.insert("temperature".into(), json!(0));
        body.insert(
            "response_format".into(),
            json!({ "type": "json_schema", "json_schema": { "name": "classification", "schema": schema } }),
        );
        if let Some(model) = &self.model {
            body.insert("model".into(), json!(model));
        }
        let data: Value = self.post("/chat/completions", Value::Object(body)).await?;
        let content = first_content(&data)?;
        let parsed: Value = parse_json(&content)?;
        let label = parsed.get("label").and_then(|v| v.as_str());
        match label {
            Some(l) if labels.contains(&l) => Ok(l.to_string()),
            _ => Err(Error::SchemaViolation),
        }
    }

    /// Extract structured data as `T`, constrained to `schema` (a JSON Schema).
    ///
    /// ```no_run
    /// # use localbrain::Client;
    /// # use serde::Deserialize;
    /// # use serde_json::json;
    /// #[derive(Deserialize)]
    /// struct Invoice { vendor: String, total: f64 }
    ///
    /// # async fn demo(ai: &Client) -> Result<(), Box<dyn std::error::Error>> {
    /// let schema = json!({
    ///     "type": "object",
    ///     "properties": { "vendor": {"type":"string"}, "total": {"type":"number"} },
    ///     "required": ["vendor", "total"]
    /// });
    /// let invoice: Invoice = ai.extract("Invoice from Acme for $42", schema).await?;
    /// # let _ = invoice.vendor; let _ = invoice.total; Ok(())
    /// # }
    /// ```
    pub async fn extract<T: DeserializeOwned>(&self, text: &str, schema: Value) -> Result<T> {
        let mut body = Map::new();
        body.insert(
            "messages".into(),
            json!([
                { "role": "system", "content": "Extract the requested fields as strict JSON. Use empty/0 values when not present." },
                { "role": "user", "content": format!("Extract fields from this text:\n\n{text}") }
            ]),
        );
        body.insert("temperature".into(), json!(0));
        body.insert(
            "response_format".into(),
            json!({ "type": "json_schema", "json_schema": { "name": "extraction", "schema": schema } }),
        );
        if let Some(model) = &self.model {
            body.insert("model".into(), json!(model));
        }
        let data: Value = self.post("/chat/completions", Value::Object(body)).await?;
        let content = first_content(&data)?;
        let value: Value = parse_json(&content)?;
        serde_json::from_value(value).map_err(|_| Error::SchemaViolation)
    }

    /// Summarize `text`.
    pub async fn summarize(&self, text: &str) -> Result<String> {
        self.summarize_with(text, &ChatOptions::default()).await
    }

    /// Summarize with options.
    pub async fn summarize_with(&self, text: &str, opts: &ChatOptions) -> Result<String> {
        let prompt = format!("Summarize the following concisely.\n\n{text}");
        let mut o = opts.clone();
        if o.temperature.is_none() {
            o.temperature = Some(0.2);
        }
        self.chat_with(&prompt, &o).await
    }

    /// Embed `text` into a vector (for semantic search).
    pub async fn embed(&self, text: &str) -> Result<Vec<f32>> {
        let mut body = Map::new();
        body.insert("input".into(), json!(text));
        if let Some(model) = self.embed_model.as_ref().or(self.model.as_ref()) {
            body.insert("model".into(), json!(model));
        }
        let data: Value = self.post("/embeddings", Value::Object(body)).await?;
        let vector = data["data"][0]["embedding"].as_array();
        match vector {
            Some(arr) => Ok(arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect()),
            None => Err(Error::BadResponse("embeddings response had no vector".into())),
        }
    }

    /// Liveness probe (does not run the model).
    pub async fn health(&self) -> Result<Health> {
        let url = format!("{}/models", self.base_url);
        let resp = self.http.get(&url).send().await.map_err(map_reqwest_err)?;
        if !resp.status().is_success() {
            return Ok(Health { ok: false, model: None });
        }
        let data: Value = resp.json().await.map_err(|e| Error::BadResponse(e.to_string()))?;
        let model = data["data"][0]["id"].as_str().map(str::to_string);
        Ok(Health { ok: true, model })
    }

    // --- internals ---

    fn add_common(&self, body: &mut Map<String, Value>, opts: &ChatOptions) {
        if let Some(model) = &self.model {
            body.insert("model".into(), json!(model));
        }
        if let Some(t) = opts.temperature {
            body.insert("temperature".into(), json!(t));
        }
        if let Some(m) = opts.max_tokens {
            body.insert("max_tokens".into(), json!(m));
        }
        if let Some(stop) = &opts.stop {
            body.insert("stop".into(), json!(stop));
        }
    }

    async fn post<T: DeserializeOwned>(&self, path: &str, body: Value) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let resp = self
            .http
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(map_reqwest_err)?;
        let status = resp.status();
        if status.as_u16() == 503 {
            return Err(Error::ModelNotReady("still loading".into()));
        }
        if !status.is_success() {
            let detail = resp.text().await.unwrap_or_default();
            return Err(Error::BadResponse(format!("HTTP {status}: {detail}")));
        }
        resp.json::<T>().await.map_err(|e| Error::BadResponse(e.to_string()))
    }
}

/// Builder for [`Client`].
#[derive(Debug, Default, Clone)]
pub struct ClientBuilder {
    base_url: Option<String>,
    model: Option<String>,
    embed_model: Option<String>,
    timeout_secs: Option<u64>,
}

impl ClientBuilder {
    /// Override the endpoint base URL (default: `LOCALBRAIN_URL` or `http://localhost:4141/v1`).
    pub fn base_url(mut self, url: impl Into<String>) -> Self {
        self.base_url = Some(url.into());
        self
    }
    /// Set the chat/completions model id.
    pub fn model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }
    /// Set the embeddings model id.
    pub fn embed_model(mut self, model: impl Into<String>) -> Self {
        self.embed_model = Some(model.into());
        self
    }
    /// Per-request timeout in seconds (default 60).
    pub fn timeout_secs(mut self, secs: u64) -> Self {
        self.timeout_secs = Some(secs);
        self
    }
    /// Build the client.
    pub fn build(self) -> Client {
        let base_url = self
            .base_url
            .or_else(|| std::env::var("LOCALBRAIN_URL").ok())
            .unwrap_or_else(|| DEFAULT_BASE_URL.to_string())
            .trim_end_matches('/')
            .to_string();
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(self.timeout_secs.unwrap_or(60)))
            .build()
            .unwrap_or_default();
        Client {
            http,
            base_url,
            model: self.model,
            embed_model: self.embed_model,
        }
    }
}

fn first_content(data: &Value) -> Result<String> {
    data["choices"][0]["message"]["content"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| Error::BadResponse("no content in completion response".into()))
}

fn parse_json(raw: &str) -> Result<Value> {
    if let Ok(v) = serde_json::from_str::<Value>(raw) {
        return Ok(v);
    }
    // Salvage a JSON object embedded in surrounding text.
    if let (Some(start), Some(end)) = (raw.find('{'), raw.rfind('}')) {
        if end > start {
            if let Ok(v) = serde_json::from_str::<Value>(&raw[start..=end]) {
                return Ok(v);
            }
        }
    }
    Err(Error::SchemaViolation)
}

fn map_reqwest_err(e: reqwest::Error) -> Error {
    if e.is_timeout() {
        Error::Timeout
    } else if e.is_connect() {
        Error::EndpointDown(e.to_string())
    } else {
        Error::BadResponse(e.to_string())
    }
}
