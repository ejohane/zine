# API inspector design

This is an operational verification surface, not the consumer Zine application.
Design choices below are implementation decisions under the user's delegated brief.

Use a restrained light neutral canvas, system typography, a single-column sign-in
state, and a two-column request/result workspace that stacks on narrow screens.
Use real labelled forms, visible keyboard focus, text buttons and clear status
messages. JSON uses a monospace face because it is code. Avoid decorative imagery,
animation and fabricated content. Source text is rendered with textContent, never
as executable HTML. Tokens never appear in the inspection output.

| Role        | Value   |
| ----------- | ------- |
| Canvas      | #f7f7f5 |
| Surface     | #ffffff |
| Text        | #20211f |
| Muted text  | #5b6059 |
| Border      | #c9cdc5 |
| Action      | #263b2c |
| Action text | #ffffff |
| Focus       | #205ec2 |
