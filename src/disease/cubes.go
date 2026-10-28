// Package disease defines cube supply rules shared by gameplay and persistence.
package disease

// MaxCubesPerColor is the total number of cubes available for each disease.
const MaxCubesPerColor = 24

// Eradicated reports whether a cured disease has every cube back in supply.
func Eradicated(cured bool, inSupply int) bool {
	return cured && inSupply == MaxCubesPerColor
}
