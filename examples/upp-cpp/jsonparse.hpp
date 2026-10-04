// The JSON reader for the C++ conformance plugin.
//
// *** NOT EXECUTED. *** This suite never builds or runs this file; nothing here has been
// compiled or run by it. A PROPOSAL, with its gaps listed in examples/upp-cpp/README.md —
// notably that `\uXXXX` is NOT decoded (four hex digits are skipped and `?` substituted). The corpus contains no
// such escape, which is exactly why the gap is written down instead of discovered later.
#pragma once

#include <cctype>
#include <optional>
#include <string>

#include "json.hpp"

namespace upp {

/// Malformed input yields `std::nullopt`, which the caller turns into -32700. It does not
/// repair, guess or recover: a frame missing its tail is not a frame.
class Parser {
 public:
  explicit Parser(std::string source) : s_(std::move(source)) {}

  std::optional<Value> parse() {
    auto value = read();
    if (!value) return std::nullopt;
    if (peek()) return std::nullopt;  // trailing input
    return value;
  }

 private:
  std::string s_;
  std::size_t i_ = 0;

  std::optional<char> peek() {
    while (i_ < s_.size() && std::isspace(static_cast<unsigned char>(s_[i_]))) ++i_;
    if (i_ >= s_.size()) return std::nullopt;
    return s_[i_];
  }
  bool eat(char c) {
    if (peek() == std::optional<char>(c)) { ++i_; return true; }
    return false;
  }
  bool literal(const char* word) {
    std::string text(word);
    if (s_.compare(i_, text.size(), text) != 0) return false;
    i_ += text.size();
    return true;
  }
  std::optional<Value> read() {
    auto c = peek();
    if (!c) return std::nullopt;
    if (*c == '{' || *c == '[') return collection(*c == '{');
    if (*c == '"') {
      auto text = string();
      if (!text) return std::nullopt;
      return Value::text(*text);
    }
    if (literal("true")) return Value::boolean(true);
    if (literal("false")) return Value::boolean(false);
    if (literal("null")) return Value::null();
    std::size_t start = i_;
    while (i_ < s_.size() && std::string("+-0123456789.eE").find(s_[i_]) != std::string::npos) ++i_;
    if (start == i_) return std::nullopt;
    try {
      return Value::number(std::stod(s_.substr(start, i_ - start)));
    } catch (...) {
      return std::nullopt;
    }
  }

  /// Objects and arrays differ in one member each, so they share one loop.
  std::optional<Value> collection(bool is_object) {
    const char close = is_object ? '}' : ']';
    ++i_;
    Array items;
    Object entries;
    auto done = [&]() { return is_object ? Value::object(entries) : Value::array(items); };
    if (peek() == std::optional<char>(close)) { ++i_; return done(); }
    for (;;) {
      if (is_object) {
        auto key = string();
        if (!key || !eat(':')) return std::nullopt;
        auto held = read();
        if (!held) return std::nullopt;
        entries.emplace_back(*key, *held);
      } else {
        auto held = read();
        if (!held) return std::nullopt;
        items.push_back(*held);
      }
      if (eat(',')) continue;
      if (!eat(close)) return std::nullopt;
      return done();
    }
  }
  std::optional<std::string> string() {
    if (!eat('"')) return std::nullopt;
    std::string out;
    while (i_ < s_.size()) {
      char c = s_[i_++];
      if (c == '"') return out;
      if (c != '\\') { out += c; continue; }
      if (i_ >= s_.size()) return std::nullopt;
      char escaped = s_[i_++];
      if (escaped == 'n') out += '\n';
      else if (escaped == 't') out += '\t';
      else if (escaped == 'r') out += '\r';
      else if (escaped == 'u') { i_ += 4; out += '?'; }  // NOT IMPLEMENTED: see the README
      else out += escaped;
    }
    return std::nullopt;
  }
};

}  // namespace upp
