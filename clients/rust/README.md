# localbrain (Rust client)

[![Crates.io](https://img.shields.io/crates/v/localbrain?logo=rust&color=E43717&label=crate)](https://crates.io/crates/localbrain)
[![docs.rs](https://img.shields.io/docsrs/localbrain?logo=docsdotrs&label=docs.rs)](https://docs.rs/localbrain)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](../../LICENSE)

Rust client for a [**localbrain**](https://github.com/kowais915/localbrain) endpoint — free, private, local AI. It makes async HTTP calls to a local, OpenAI-compatible model, so it's a tiny dependency (`reqwest` + `serde`). No API key.

```toml
# Cargo.toml
[dependencies]
localbrain = "0.1"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
```

```rust
use localbrain::Client;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ai = Client::new(); // LOCALBRAIN_URL, or http://localhost:4141/v1

    let reply  = ai.chat("Summarize: ...").await?;
    let label  = ai.classify(text, &["work", "personal", "urgent"]).await?; // one label
    let vector = ai.embed("find me by meaning").await?;                     // Vec<f32>
    Ok(())
}
```

## Getting an endpoint

This crate is only the client. To download a model and serve the endpoint it talks to, run the CLI in your project once (Node tool):

```bash
npx localbrain          # one-time setup
npx localbrain start    # serves http://localhost:4141/v1
```

## API

```rust
Client::new()                                   // from LOCALBRAIN_URL / default
Client::builder().base_url(..).model(..).build()

ai.chat(prompt).await?                 -> String
ai.chat_with(prompt, &opts).await?     -> String   // ChatOptions { temperature, max_tokens, system, stop }
ai.classify(text, &["a","b"]).await?   -> String   // exactly one label
ai.extract::<T>(text, schema).await?   -> T         // T: Deserialize; schema is a serde_json JSON Schema
ai.summarize(text).await?              -> String
ai.embed(text).await?                  -> Vec<f32>
ai.health().await?                     -> Health
```

Errors are a typed `localbrain::Error` (`EndpointDown`, `ModelNotReady`, `Timeout`, `BadResponse`, `SchemaViolation`).

Structured extraction:

```rust
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct Invoice { vendor: String, total: f64 }

let schema = json!({
    "type": "object",
    "properties": { "vendor": {"type":"string"}, "total": {"type":"number"} },
    "required": ["vendor", "total"]
});
let invoice: Invoice = ai.extract("Invoice from Acme for $42", schema).await?;
```

## Framework examples

### Axum

```toml
[dependencies]
localbrain = "0.1"
axum = "0.7"
tokio = { version = "1", features = ["macros", "rt-multi-thread"] }
serde = { version = "1", features = ["derive"] }
```

```rust
use axum::{extract::State, routing::post, Json, Router};
use localbrain::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;

#[derive(Deserialize)]
struct In { text: String }
#[derive(Serialize)]
struct Out { label: String }

async fn triage(State(ai): State<Arc<Client>>, Json(inp): Json<In>) -> Result<Json<Out>, String> {
    let label = ai
        .classify(&inp.text, &["billing", "support", "sales"])
        .await
        .map_err(|e| e.to_string())?;
    Ok(Json(Out { label }))
}

#[tokio::main]
async fn main() {
    let ai = Arc::new(Client::new());
    let app = Router::new().route("/triage", post(triage)).with_state(ai);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
```

### Actix Web

```toml
[dependencies]
localbrain = "0.1"
actix-web = "4"
serde = { version = "1", features = ["derive"] }
```

```rust
use actix_web::{post, web, App, HttpResponse, HttpServer, Responder};
use localbrain::Client;
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
struct In { text: String }
#[derive(Serialize)]
struct Out { label: String }

#[post("/triage")]
async fn triage(ai: web::Data<Client>, body: web::Json<In>) -> impl Responder {
    match ai.classify(&body.text, &["billing", "support", "sales"]).await {
        Ok(label) => HttpResponse::Ok().json(Out { label }),
        Err(e) => HttpResponse::InternalServerError().body(e.to_string()),
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    let ai = web::Data::new(Client::new());
    HttpServer::new(move || App::new().app_data(ai.clone()).service(triage))
        .bind(("0.0.0.0", 3000))?
        .run()
        .await
}
```

### Leptos

Leptos components run as WASM in the browser, so call localbrain from a **server function** (`#[server]`) — its body only compiles/runs on the server, which is where the AI call belongs. Make the crate a server-only (optional) dependency enabled by your `ssr` feature:

```toml
[dependencies]
leptos = "0.7"
serde = { version = "1", features = ["derive"] }
# server-only:
localbrain = { version = "0.1", optional = true }

[features]
hydrate = ["leptos/hydrate"]
ssr = ["leptos/ssr", "dep:localbrain"]   # localbrain only in the server build
```

```rust
use leptos::prelude::*;

// Runs on the server; the browser calls it over HTTP automatically.
#[server]
pub async fn triage(text: String) -> Result<String, ServerFnError> {
    use localbrain::Client;
    let ai = Client::new(); // LOCALBRAIN_URL, or http://localhost:4141/v1
    ai.classify(&text, &["billing", "support", "sales"])
        .await
        .map_err(|e| ServerFnError::new(e.to_string()))
}

#[component]
pub fn Triage() -> impl IntoView {
    let action = ServerAction::<Triage>::new();
    view! {
        <button on:click=move |_| { action.dispatch(Triage { text: "the invoice is overdue".into() }); }>
            "Classify"
        </button>
        <p>{move || action.value().get().map(|r| format!("{r:?}"))}</p>
    }
}
```

> Leptos 0.6: use `use leptos::*;` and `create_server_action::<Triage>()` instead of `ServerAction::<Triage>::new()`. The `#[server]` function body is identical.

Because `localbrain` sits behind the `ssr` feature and is only used inside `#[server]` bodies, it never enters your WASM/client bundle.

### Plain Tokio

See [`examples/basic.rs`](./examples/basic.rs) — run it with `cargo run --example basic` while an endpoint is up.

## Notes

- **Small local model:** great at classify / extract / summarize / route / light chat — not GPT-class reasoning. For hard tasks, keep a cloud model and route only those calls out.
- `Client` is cheap to `clone()` (shares one connection pool) — store it in your app state.

## License

MIT
