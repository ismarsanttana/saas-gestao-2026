package util

import "time"

// Now retorna time.Now() com precisão em UTC.
func Now() time.Time {
	return time.Now().UTC()
}
