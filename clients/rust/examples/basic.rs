//! Minimal example. Make sure a localbrain endpoint is running first:
//!   npx localbrain            # one-time setup (downloads a model)
//!   npx localbrain start      # serves http://localhost:4141/v1
//!
//! Then: cargo run --example basic
use localbrain::Client;
use serde::Deserialize;
use serde_json::json;

#[derive(Debug, Deserialize)]
struct Invoice {
    vendor: String,
    total: f64,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let ai = Client::new(); // LOCALBRAIN_URL or http://localhost:4141/v1

    let reply = ai.chat("Say hi in five words").await?;
    println!("chat:     {reply}");

    let label = ai
        .classify("the invoice is overdue", &["billing", "support", "sales"])
        .await?;
    println!("classify: {label}");

    let schema = json!({
        "type": "object",
        "properties": { "vendor": { "type": "string" }, "total": { "type": "number" } },
        "required": ["vendor", "total"]
    });
    let invoice: Invoice = ai.extract("Invoice from Acme Corp for $42.00", schema).await?;
    println!("extract:  vendor={} total={}", invoice.vendor, invoice.total);

    Ok(())
}
