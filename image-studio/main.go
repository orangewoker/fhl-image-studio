package main

import (
	"embed"
	"net/http"
	"runtime"

	"image-studio/backend"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsmac "github.com/wailsapp/wails/v2/pkg/options/mac"
	wailswindows "github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	svc := backend.NewService()
	appOptions := &options.App{
		Title:     "FHL Studio",
		Width:     1440,
		Height:    980,
		MinWidth:  1100,
		MinHeight: 780,
		AssetServer: &assetserver.Options{
			Assets:     assets,
			Handler:    svc.MediaHandler(http.NotFoundHandler()),
			Middleware: svc.MediaHandler,
		},
		BackgroundColour: &options.RGBA{R: 18, G: 20, B: 26, A: 1},
		OnStartup:        svc.Startup,
		Bind: []interface{}{
			svc,
		},
	}

	if runtime.GOOS == "darwin" {
		appOptions.Mac = &wailsmac.Options{
			Appearance:           wailsmac.DefaultAppearance,
			TitleBar:             wailsmac.TitleBarHiddenInset(),
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
		}
	}
	if runtime.GOOS == "windows" {
		webviewUserDataPath, err := backend.WindowsWebviewUserDataPath()
		if err != nil {
			println("Error:", err.Error())
			return
		}
		legacyWebviewUserDataPaths, err := backend.WindowsLegacyWebviewUserDataPaths()
		if err != nil {
			println("Error:", err.Error())
			return
		}
		if err := backend.MigrateWindowsWebviewDataDirs(webviewUserDataPath, legacyWebviewUserDataPaths); err != nil {
			println("Warning:", err.Error())
		}
		appOptions.Windows = &wailswindows.Options{
			Theme:                wailswindows.SystemDefault,
			BackdropType:         wailswindows.Mica,
			WebviewIsTransparent: false,
			WindowIsTranslucent:  true,
			WebviewUserDataPath:  webviewUserDataPath,
			CustomTheme: &wailswindows.ThemeSettings{
				DarkModeTitleBar:           wailswindows.RGB(32, 32, 32),
				DarkModeTitleBarInactive:   wailswindows.RGB(38, 38, 38),
				DarkModeTitleText:          wailswindows.RGB(245, 245, 245),
				DarkModeTitleTextInactive:  wailswindows.RGB(200, 200, 200),
				DarkModeBorder:             wailswindows.RGB(54, 54, 54),
				DarkModeBorderInactive:     wailswindows.RGB(45, 45, 45),
				LightModeTitleBar:          wailswindows.RGB(243, 243, 243),
				LightModeTitleBarInactive:  wailswindows.RGB(237, 237, 237),
				LightModeTitleText:         wailswindows.RGB(31, 31, 31),
				LightModeTitleTextInactive: wailswindows.RGB(96, 96, 96),
				LightModeBorder:            wailswindows.RGB(219, 219, 219),
				LightModeBorderInactive:    wailswindows.RGB(226, 226, 226),
			},
		}
	}

	err := wails.Run(appOptions)

	if err != nil {
		println("Error:", err.Error())
	}
}
