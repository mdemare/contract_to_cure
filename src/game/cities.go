package game

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"slices"
)

// MapCityCount is the number of cities in public/cities.json.
const MapCityCount = 48

// Map is the board from public/cities.json, in file order. Setup builds the
// cities and both decks in this order before shuffling.
type Map struct {
	Cities []MapCity
}

type MapCity struct {
	Name        string
	Color       Color
	Connections []string
}

// LoadMapFile reads the board from public/cities.json.
func LoadMapFile(path string) (*Map, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return LoadMap(f)
}

// LoadMap reads a cities.json object, keeping its key order. Like Setup's
// init_cities, it requires 48 cities and connections that go both ways
// between the cities in the file.
func LoadMap(r io.Reader) (*Map, error) {
	dec := json.NewDecoder(r)
	if tok, err := dec.Token(); err != nil || tok != json.Delim('{') {
		return nil, fmt.Errorf("cities: expected a JSON object")
	}
	m := &Map{}
	for dec.More() {
		tok, err := dec.Token()
		if err != nil {
			return nil, fmt.Errorf("cities: %w", err)
		}
		name := tok.(string)
		var data struct {
			Color       string   `json:"color"`
			Connections []string `json:"connections"`
		}
		if err := dec.Decode(&data); err != nil {
			return nil, fmt.Errorf("cities: %s: %w", name, err)
		}
		color, err := Parse(data.Color, Colors)
		if err != nil {
			return nil, fmt.Errorf("cities: %s: %w", name, err)
		}
		if m.city(name) != nil {
			return nil, fmt.Errorf("cities: %s is listed twice", name)
		}
		m.Cities = append(m.Cities, MapCity{Name: name, Color: color, Connections: data.Connections})
	}
	if _, err := dec.Token(); err != nil {
		return nil, fmt.Errorf("cities: %w", err)
	}
	if len(m.Cities) != MapCityCount {
		return nil, fmt.Errorf("cities: got %d cities, want %d", len(m.Cities), MapCityCount)
	}
	for _, c := range m.Cities {
		for _, other := range m.Cities {
			if slices.Contains(other.Connections, c.Name) != slices.Contains(c.Connections, other.Name) {
				return nil, fmt.Errorf("cities: asymmetric connection between %s and %s", c.Name, other.Name)
			}
		}
	}
	return m, nil
}

func (m *Map) city(name string) *MapCity {
	for i := range m.Cities {
		if m.Cities[i].Name == name {
			return &m.Cities[i]
		}
	}
	return nil
}
