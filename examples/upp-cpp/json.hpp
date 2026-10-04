// A hand-written JSON value, reader and writer for the C++ conformance plugin.
//
// *** NOT EXECUTED. *** This suite never builds or runs this file, so no line here has been
// compiled or run by it. Read every claim as a PROPOSAL; examples/upp-cpp/README.md has the exact
// build command and the list of known gaps. Dependency-free on purpose: the C++ standard
// library has no JSON, and adding nlohmann or RapidJSON would make the README's claim false.
//
// This header holds the VALUE and the WRITER; the reader is in `jsonparse.hpp`. The split is
// the same one examples/upp-rust makes, and for the same reason: neither half then passes the
// project's 200-line limit.
#pragma once

#include <cctype>
#include <cstdint>
#include <cstdio>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <utility>
#include <variant>
#include <vector>

namespace upp {

struct Value;
using Object = std::vector<std::pair<std::string, Value>>;
using Array = std::vector<Value>;

/// A JSON value. `Object` and `Array` hold `Value`s, so they are held indirectly: a variant
/// cannot contain an incomplete type by value.
struct Value {
  std::variant<std::monostate, bool, double, std::string,
               std::shared_ptr<Array>, std::shared_ptr<Object>> held;
  static Value null() { return Value{std::monostate{}}; }
  static Value boolean(bool flag) { return Value{flag}; }
  static Value number(double n) { return Value{n}; }
  static Value text(std::string s) { return Value{std::move(s)}; }
  static Value array(Array items) { return Value{std::make_shared<Array>(std::move(items))}; }
  static Value object(Object entries) { return Value{std::make_shared<Object>(std::move(entries))}; }
  const Object* as_object() const {
    auto held_object = std::get_if<std::shared_ptr<Object>>(&held);
    return held_object ? held_object->get() : nullptr;
  }
  const Array* as_array() const {
    auto held_array = std::get_if<std::shared_ptr<Array>>(&held);
    return held_array ? held_array->get() : nullptr;
  }
  const std::string* as_text() const { return std::get_if<std::string>(&held); }

  /// The value of `key`, for an object; `nullptr` otherwise. A reader that threw on a shape a
  /// peer chose would make every malformed message a crash.
  const Value* get(const std::string& key) const {
    const Object* entries = as_object();
    if (!entries) return nullptr;
    for (const auto& entry : *entries) {
      if (entry.first == key) return &entry.second;
    }
    return nullptr;
  }
};

inline void quote(const std::string& text, std::string& out) {
  out += '"';
  for (unsigned char c : text) {
    if (c == '"' || c == '\\') { out += '\\'; out += static_cast<char>(c); }
    else if (c == '\n') out += "\\n";
    else if (c == '\r') out += "\\r";
    else if (c == '\t') out += "\\t";
    else if (c < 0x20) {
      char buffer[8];
      std::snprintf(buffer, sizeof buffer, "\\u%04x", c);
      out += buffer;
    } else {
      out += static_cast<char>(c);
    }
  }
  out += '"';
}

inline void render(const Value& value, std::string& out) {
  if (std::holds_alternative<std::monostate>(value.held)) { out += "null"; return; }
  if (auto flag = std::get_if<bool>(&value.held)) { out += *flag ? "true" : "false"; return; }
  if (auto n = std::get_if<double>(&value.held)) {
    std::ostringstream stream;
    if (*n == static_cast<double>(static_cast<std::int64_t>(*n))) stream << static_cast<std::int64_t>(*n);
    else stream << *n;
    out += stream.str();
    return;
  }
  if (auto s = value.as_text()) { quote(*s, out); return; }
  if (const Array* items = value.as_array()) {
    out += '[';
    for (std::size_t i = 0; i < items->size(); ++i) {
      if (i) out += ',';
      render((*items)[i], out);
    }
    out += ']';
    return;
  }
  const Object* entries = value.as_object();
  out += '{';
  for (std::size_t i = 0; entries && i < entries->size(); ++i) {
    if (i) out += ',';
    quote((*entries)[i].first, out);
    out += ':';
    render((*entries)[i].second, out);
  }
  out += '}';
}

inline std::string line(const Value& value) {
  std::string out;
  render(value, out);
  return out;
}

}  // namespace upp
