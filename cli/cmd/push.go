package cmd

import (
	"fmt"
	"os"

	"github.com/gvkhna/warpdive/dive"
	"github.com/gvkhna/warpdive/runtime"
	"github.com/spf13/cobra"
)

var pushCmd = &cobra.Command{
	Use:   "push [IMAGE ID]",
	Short: "Pushes a container image to to warpdive.xyz",
	Args:  cobra.ExactArgs(1), // Expect exactly one argument: the docker image/tag id
	Run:   doPushCmd,
}

// var outputFilePath string

func init() {
	rootCmd.AddCommand(pushCmd)
}

// doPushCmd implements the steps taken for the push command
func doPushCmd(cmd *cobra.Command, args []string) {
	userImage := args[0]
	if userImage == "" {
		fmt.Println("No image argument given")
		os.Exit(1)
	}

	var sourceType dive.ImageSource
	var imageStr string

	sourceType, imageStr = dive.DeriveImageSource(userImage)

	if sourceType == dive.SourceUnknown {
		// sourceStr := viper.GetString("source")
		sourceType = dive.ParseImageSource(defaultSource)
		if sourceType == dive.SourceUnknown {
			fmt.Printf("unable to determine image source: %v\n", defaultSource)
			os.Exit(1)
		}

		imageStr = userImage
	}

	// ignoreErrors, err := cmd.PersistentFlags().GetBool("ignore-errors")
	// if err != nil {
	// 	logrus.Error("unable to get 'ignore-errors' option:", err)
	// }

	runtime.Run(runtime.Options{
		// Ci:         isCi,
		Image:  imageStr,
		Engine: defaultSource,
		Source: dive.ParseImageSource(defaultSource),
		// Source:     dive.ParseImageSource(engine),
		PushArgs: args,
		// ExportFile: exportFile,
		// ExportFile: outputFilePath,
		// CiConfig:   ciConfig,
	})
}
