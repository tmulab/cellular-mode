// The UPP 1.0 conformance reference plugin, in C++17.
//
// *** NOT EXECUTED. *** This machine has no C++ compiler, so this file has NEVER been
// compiled or run here, and the interop record in docs/upp/CONFORMANCE.md says so. Treat it
// as a PROPOSAL: a translation of examples/upp-node/plugin.mjs that is believed correct and
// has not been measured. The first person with a compiler should expect to fix something.
//
// Build (nothing fetched, no dependency, two headers beside this file):
//   g++   -std=c++17 -O2 -o upp-plugin plugin.cpp
//   clang -std=c++17 -O2 -o upp-plugin plugin.cpp -lstdc++
//   cl /std:c++17 /EHsc /Fe:upp-plugin.exe plugin.cpp
//
// Usage:  upp-plugin <path-to-upp/conformance/manifest.json>
#include <cctype>
#include <cstdio>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "json.hpp"
#include "jsonparse.hpp"

namespace {

const char* const kProtocol = "1.0";
constexpr std::size_t kMaxText = 4096;

upp::Value Obj(upp::Object entries) { return upp::Value::object(std::move(entries)); }
upp::Value Str(const std::string& text) { return upp::Value::text(text); }

std::string Envelope(const upp::Value& id, const char* key, const upp::Value& body) {
  return upp::line(Obj({{"jsonrpc", Str("2.0")}, {"id", id}, {key, body}}));
}

std::string Error(const upp::Value& id, int code, const char* kernel_code, const std::string& message) {
  upp::Value body = Obj({{"code", upp::Value::number(code)},
                         {"message", Str(message)},
                         {"data", Obj({{"code", Str(kernel_code)}})}});
  return Envelope(id, "error", body);
}

/// Words are runs of non-whitespace. The one definition every implementation must share.
long CountWords(const std::string& text) {
  std::istringstream stream(text);
  std::string word;
  long words = 0;
  while (stream >> word) ++words;
  return words;
}

/// The declared input contract, checked by hand, because the PLUGIN sees the input first and
/// -32602 is therefore its answer to give. Returns the breach, or an empty string.
std::string BreachOf(const upp::Value* input) {
  const upp::Object* entries = input ? input->as_object() : nullptr;
  if (!entries) return "input must be an object";
  std::vector<std::string> extra;
  for (const auto& entry : *entries) {
    if (entry.first != "text") extra.push_back(entry.first);
  }
  if (!extra.empty()) {
    std::string joined;
    for (std::size_t i = 0; i < extra.size(); ++i) joined += (i ? ", " : "") + extra[i];
    return "unknown input field(s): " + joined;
  }
  const upp::Value* text = input->get("text");
  const std::string* value = text ? text->as_text() : nullptr;
  if (!value) return "input.text is required and must be a string";
  if (value->size() > kMaxText) return "input.text must be at most 4096 characters";
  return "";
}

std::string Execute(const upp::Value& id, const upp::Value* params) {
  const upp::Value* capability = params ? params->get("capability") : nullptr;
  const std::string* name = capability ? capability->as_text() : nullptr;
  if (!name || *name != "wordcount") {
    return Error(id, -32001, "NOT_FOUND", "no capability \"" + (name ? *name : std::string()) + "\"");
  }
  const upp::Value* input = params->get("input");
  std::string breach = BreachOf(input);
  if (!breach.empty()) return Error(id, -32602, "INPUT_INVALID", breach);
  const std::string& text = *input->get("text")->as_text();
  upp::Value words = upp::Value::number(static_cast<double>(CountWords(text)));
  return Envelope(id, "result", Obj({{"output", Obj({{"words", words}})}}));
}

/// Returns the line to write, or an empty string for a notification — which is never answered.
std::string Dispatch(const upp::Value& message, const upp::Value& manifest) {
  const upp::Value* id_held = message.get("id");
  upp::Value id = id_held ? *id_held : upp::Value::null();
  const upp::Value* method_held = message.get("method");
  const std::string* method_text = method_held ? method_held->as_text() : nullptr;
  std::string method = method_text ? *method_text : std::string();
  const upp::Value* params = message.get("params");

  if (method == "upp.cancel") return "";
  if (method == "upp.exit") {
    std::cout.flush();
    std::exit(0);
  }
  if (method == "upp.initialize") {
    std::vector<std::string> offered;
    const upp::Value* versions = params ? params->get("protocolVersions") : nullptr;
    if (versions) {
      const upp::Array* items = versions->as_array();
      for (std::size_t i = 0; items && i < items->size(); ++i) {
        if (const std::string* text = (*items)[i].as_text()) offered.push_back(*text);
      }
    }
    bool shared = false;
    std::string joined;
    for (std::size_t i = 0; i < offered.size(); ++i) {
      joined += (i ? ", " : "") + offered[i];
      if (offered[i] == kProtocol) shared = true;
    }
    if (!shared) {
      return Error(id, -32002, "CONTRACT_INVALID",
                   std::string("this plugin speaks ") + kProtocol + "; the host offered [" + joined + "]");
    }
    return Envelope(id, "result", Obj({{"protocolVersion", Str(kProtocol)}, {"manifest", manifest}}));
  }
  if (method == "upp.capabilities") {
    const upp::Value* caps = manifest.get("capabilities");
    return Envelope(id, "result", Obj({{"capabilities", caps ? *caps : Obj({})}}));
  }
  if (method == "upp.health") return Envelope(id, "result", Obj({{"status", Str("ok")}}));
  if (method == "upp.shutdown") return Envelope(id, "result", Obj({}));
  if (method == "upp.execute") return Execute(id, params);
  return Error(id, -32601, "CONTRACT_INVALID", "unknown method \"" + method + "\"");
}

}  // namespace

int main(int argc, char** argv) {
  if (argc < 2) {
    std::cerr << "usage: upp-plugin <manifest.json>\n";
    return 2;
  }
  std::ifstream file(argv[1]);
  if (!file) {
    std::cerr << "the manifest could not be read: " << argv[1] << "\n";
    return 2;
  }
  std::ostringstream buffer;
  buffer << file.rdbuf();
  upp::Parser manifest_parser(buffer.str());
  auto manifest = manifest_parser.parse();
  if (!manifest) {
    std::cerr << "the manifest is not valid JSON\n";
    return 2;
  }

  std::string line;
  while (std::getline(std::cin, line)) {
    if (line.find_first_not_of(" \t\r\n") == std::string::npos) continue;
    upp::Parser parser(line);
    auto message = parser.parse();
    std::string answer;
    if (!message) {
      // The id could not be read: the one case JSON-RPC reserves a null id for.
      answer = Error(upp::Value::null(), -32700, "PLUGIN_ERROR", "the line is not valid JSON");
    } else {
      answer = Dispatch(*message, *manifest);
    }
    if (!answer.empty()) {
      // Flushed every time: a block-buffered stdout makes a correct plugin look like one that
      // never answers, which is a timeout nobody can explain.
      std::cout << answer << "\n";
      std::cout.flush();
    }
  }
  return 0;
}
