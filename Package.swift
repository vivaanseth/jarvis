// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "Jarvis",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "JarvisNativeBridge", targets: ["JarvisNativeBridge"])
    ],
    targets: [
        .executableTarget(
            name: "JarvisNativeBridge",
            path: "Sources/JarvisNativeBridge",
            exclude: ["Info.plist"],
            swiftSettings: [
                // The executable uses an async @main entry point in a file
                // historically named main.swift. Newer Xcode toolchains infer
                // top-level-main semantics from that filename unless this is
                // explicitly compiled as a library module.
                .unsafeFlags(["-parse-as-library"])
            ],
            linkerSettings: [
                .linkedFramework("ApplicationServices"),
                .linkedFramework("AppKit"),
                .linkedFramework("AVFoundation"),
                .linkedFramework("Contacts"),
                .linkedFramework("CoreGraphics"),
                .linkedFramework("EventKit"),
                .linkedFramework("PDFKit"),
                .linkedFramework("ServiceManagement"),
                .linkedFramework("Speech"),
                .linkedFramework("UserNotifications"),
                .linkedFramework("Vision"),
                .unsafeFlags([
                    "-Xlinker", "-sectcreate",
                    "-Xlinker", "__TEXT",
                    "-Xlinker", "__info_plist",
                    "-Xlinker", "Sources/JarvisNativeBridge/Info.plist"
                ])
            ]
        )
    ]
)
