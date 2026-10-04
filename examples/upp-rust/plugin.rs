// The UPP 1.0 conformance reference plugin, in Rust, std only.
//
// Compiled at test time with `rustc --edition 2021 -o <tmp>/upp-plugin plugin.rs`: no cargo,
// no Cargo.toml, no crate fetched, nothing from the network. The JSON codec Rust's standard
// library does not have lives in `json.rs` beside this file — a crate root may declare
// `mod json;` and rustc reads it from the same directory, with no build tool involved.
//
// It is a translation of examples/upp-node/plugin.mjs and shares no code with the host that
// tests it: that would only prove the two agree with themselves.
//
// Usage:  upp-plugin <path-to-upp/conformance/manifest.json>
mod json;

use json::{obj, s, J, Parser};
use std::io::{self, BufRead, Write};

const PROTOCOL: &str = "1.0";
const MAX_TEXT: usize = 4096;

fn envelope(id: J, key: &str, body: J) -> String {
    obj(vec![("jsonrpc", s("2.0")), ("id", id), (key, body)]).line()
}

fn error(id: J, code: i64, kernel_code: &str, message: &str) -> String {
    let body = obj(vec![("code", J::Num(code as f64)), ("message", s(message)),
                        ("data", obj(vec![("code", s(kernel_code))]))]);
    envelope(id, "error", body)
}

/// Words are runs of non-whitespace. The one definition every implementation must share.
fn count_words(text: &str) -> usize { text.split_whitespace().count() }

/// The declared input contract, checked by hand, because the PLUGIN is what sees the input
/// first and -32602 is therefore its answer to give. Returns the breach, or None.
fn breach_of(input: Option<&J>) -> Option<String> {
    let entries = match input {
        Some(J::Obj(entries)) => entries,
        _ => return Some("input must be an object".into()),
    };
    let extra: Vec<&str> = entries.iter().map(|(k, _)| k.as_str()).filter(|k| *k != "text").collect();
    if !extra.is_empty() {
        return Some(format!("unknown input field(s): {}", extra.join(", ")));
    }
    match entries.iter().find(|(k, _)| k == "text").map(|(_, v)| v) {
        Some(J::Str(text)) if text.chars().count() > MAX_TEXT =>
            Some(format!("input.text must be at most {} characters", MAX_TEXT)),
        Some(J::Str(_)) => None,
        _ => Some("input.text is required and must be a string".into()),
    }
}

fn execute(id: J, params: Option<&J>) -> Option<String> {
    let capability = params.and_then(|p| p.get("capability")).and_then(|c| c.text()).unwrap_or("");
    if capability != "wordcount" {
        return Some(error(id, -32001, "NOT_FOUND", &format!("no capability \"{}\"", capability)));
    }
    let input = params.and_then(|p| p.get("input"));
    if let Some(breach) = breach_of(input) {
        return Some(error(id, -32602, "INPUT_INVALID", &breach));
    }
    let text = input.and_then(|i| i.get("text")).and_then(|t| t.text()).unwrap_or("");
    let words = J::Num(count_words(text) as f64);
    Some(envelope(id, "result", obj(vec![("output", obj(vec![("words", words)]))])))
}

/// `None` means the message was a notification, which is never answered.
fn dispatch(message: &J, manifest: &J) -> Option<String> {
    let id = message.get("id").cloned().unwrap_or(J::Null);
    let method = message.get("method").and_then(|m| m.text()).unwrap_or("");
    let params = message.get("params");
    match method {
        "upp.cancel" => None,
        "upp.exit" => { io::stdout().flush().ok(); std::process::exit(0); }
        "upp.initialize" => {
            let offered: Vec<&str> = match params.and_then(|p| p.get("protocolVersions")) {
                Some(J::Arr(items)) => items.iter().filter_map(|i| i.text()).collect(),
                _ => Vec::new(),
            };
            if !offered.contains(&PROTOCOL) {
                return Some(error(id, -32002, "CONTRACT_INVALID", &format!(
                    "this plugin speaks {}; the host offered [{}]", PROTOCOL, offered.join(", "))));
            }
            Some(envelope(id, "result",
                obj(vec![("protocolVersion", s(PROTOCOL)), ("manifest", manifest.clone())])))
        }
        "upp.capabilities" => {
            let caps = manifest.get("capabilities").cloned().unwrap_or(J::Obj(vec![]));
            Some(envelope(id, "result", obj(vec![("capabilities", caps)])))
        }
        "upp.health" => Some(envelope(id, "result", obj(vec![("status", s("ok"))]))),
        "upp.shutdown" => Some(envelope(id, "result", J::Obj(vec![]))),
        "upp.execute" => execute(id, params),
        other => Some(error(id, -32601, "CONTRACT_INVALID", &format!("unknown method \"{}\"", other))),
    }
}

fn main() {
    let path = match std::env::args().nth(1) {
        Some(path) => path,
        None => { eprintln!("usage: upp-plugin <manifest.json>"); std::process::exit(2); }
    };
    let text = std::fs::read_to_string(&path).expect("the manifest could not be read");
    let manifest = Parser::new(&text).parse().expect("the manifest is not valid JSON");
    let stdin = io::stdin();
    let mut out = io::stdout();
    for line in stdin.lock().lines() {
        let line = match line { Ok(line) => line, Err(_) => break };
        if line.trim().is_empty() { continue; }
        let answer = match Parser::new(&line).parse() {
            // The id could not be read: the one case JSON-RPC reserves a null id for.
            Err(_) => Some(error(J::Null, -32700, "PLUGIN_ERROR", "the line is not valid JSON")),
            Ok(message) => dispatch(&message, &manifest),
        };
        if let Some(answer) = answer {
            // Flushed every time: a block-buffered stdout would make a correct plugin look
            // like one that never answers, which is a timeout nobody can explain.
            writeln!(out, "{}", answer).ok();
            out.flush().ok();
        }
    }
}
