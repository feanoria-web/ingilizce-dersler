-- Optional, versioned learning observations accompany existing durable events.
-- Heartbeat credit remains in events.active_seconds; observed page/question
-- durations in this table are analytics, never additional attendance credit.
CREATE TABLE event_learning (
  event_id INTEGER PRIMARY KEY REFERENCES events(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('question','help','page','progress','break','dictionary')),
  question_id TEXT,
  topic_id TEXT,
  payload_json TEXT NOT NULL CHECK(json_valid(payload_json))
);
CREATE INDEX event_learning_question ON event_learning(question_id,event_id) WHERE question_id IS NOT NULL;
CREATE INDEX event_learning_topic ON event_learning(topic_id,event_id) WHERE topic_id IS NOT NULL;
CREATE INDEX event_learning_kind ON event_learning(kind,event_id);
