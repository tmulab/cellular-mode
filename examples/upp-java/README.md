# `examples/upp-java` — the UPP reference plugin in Java 21

One file, no build tool, no jar, no dependency, nothing outside `java.base`.

```
java Plugin.java ../../upp/conformance/manifest.json
npm run upp:conformance -- --impl java          # from the repository root
```

This is the JEP 330 **single-file source launcher**: `java Plugin.java` compiles in memory and
runs. It needs JDK 11+, and this source uses Java 21 constructs, so the runner probes
`java -version` and reports `SKIPPED` with the version it found when it is older — on the machine
this was written on the `java` on `PATH` is a Java 8 wrapper, and `JAVA_HOME` is what makes
it work. `UPP_JAVA_HOME` overrides it if you need a second JDK just for the conformance run
(`JDK_HOME_VARS` in `eip/upp-host/toolchains.mjs`).

JDK 21 cannot source-launch more than one file, so the hand-written JSON codec cannot be split
out and the single file is dense. JDK 22+ (JEP 458) would allow the split.

## The hand-written JSON reader and writer

`java.base` has no JSON, so roughly half the file is a reader and a writer. They are complete
enough for the corpus and no more. Known gaps, none of which the corpus reaches:

- **surrogate pairs**: `\uXXXX` is decoded one unit at a time, so a non-BMP escape pair is not
  recombined;
- **numbers** are all `double`, printed as integers when integral — the host compares canonical
  JSON, so `4096` and `4096.0` pin identically, but precision beyond `double` is lost;
- **duplicate keys**: the last one wins, silently;
- **no depth limit**, so a deeply nested hostile input would recurse;
- `\b` and `\f` are read but written as the raw control escape form.

Nobody should lift this codec into production. Use Jackson or `jakarta.json` there.

## The corpus

Eleven cases, in [`upp/conformance/`](../../upp/conformance/README.md). The manifest this
implementation serves is `upp/conformance/manifest.json` and its path arrives as `argv[1]`;
the host pins the canonical SHA-256 of that manifest, so answering a different one is refused
at `upp.initialize`.

## Limits of this example

It is a conformance implementation, not a library. It has no logging policy, no configuration,
no concurrency, no back-pressure and no health model beyond a constant `ok`. It answers one
message at a time, in order, which is all the corpus asks of it.
