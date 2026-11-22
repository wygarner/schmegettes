package notices

import "context"

// StatusPage is the only provider boundary. It receives notice text and schedule data only.
type StatusPage interface {
	Open(context.Context, Notice) (string, error)
	Update(context.Context, Notice) error
	Resolve(context.Context, Notice) error
}

type NoopStatusPage struct{}

func (NoopStatusPage) Open(context.Context, Notice) (string, error) { return "", nil }
func (NoopStatusPage) Update(context.Context, Notice) error         { return nil }
func (NoopStatusPage) Resolve(context.Context, Notice) error        { return nil }
