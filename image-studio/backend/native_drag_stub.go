//go:build !darwin

package backend

import "errors"

func beginNativeFileDrag(_ string) error {
	return errors.New("current platform does not support native file drag")
}
