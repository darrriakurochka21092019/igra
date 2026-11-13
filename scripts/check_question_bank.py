"""Validate the question bank schema and its in-game references."""

import json
from collections import Counter
from pathlib import Path

from jsonschema import Draft202012Validator


BANK_DIR = Path(__file__).resolve().parents[1] / "content" / "questions"


def read_json(filename):
    with (BANK_DIR / filename).open(encoding="utf-8") as source:
        return json.load(source)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_bank():
    schema = read_json("question-bank.schema.json")
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    index = read_json("index.json")
    chapters = index["chapters"]
    require(index["schemaVersion"] == schema["properties"]["schemaVersion"]["const"], "Version mismatch")
    require([chapter["chapter"] for chapter in chapters] == list(range(1, 7)), "Chapter order or count")
    require(len({chapter["scene"] for chapter in chapters}) == len(chapters), "Duplicate scene IDs")

    oral = read_json(index["oralFile"])
    validator.validate(oral)
    oral_questions = {question["id"]: question for question in oral["questions"]}
    require(len(oral_questions) == len(oral["questions"]), "Duplicate oral question IDs")

    written = {}
    encounters = set()
    required_oral = set()
    for chapter in chapters:
        number = chapter["chapter"]
        file = read_json(chapter["file"])
        validator.validate(file)
        require((file["chapter"], file["title"]) == (number, chapter["title"]), f"Chapter {number} metadata")
        records = file["questions"]
        ids = [question["id"] for question in records]
        require(ids == [f"C{number:02}-{position:02}" for position in range(1, 19)], f"Chapter {number} IDs")
        require(not written.keys() & set(ids), f"Chapter {number} has duplicate question IDs")
        written.update(zip(ids, records))

        nodes = chapter["encounters"]
        require(len(nodes) == 3, f"Chapter {number} needs three encounters")
        expected_ids = [question["id"] for question in records if question["track"] == "story"]
        actual_ids = [question_id for node in nodes for question_id in node["requires"]]
        require(actual_ids == expected_ids == ids[:6], f"Chapter {number} story order or coverage")
        for node in nodes:
            event = node["event"]
            require(event not in encounters, f"Duplicate event {event}")
            encounters.add(event)
            require(len(node["requires"]) == 2, f"{event} needs two questions")
            for question_id in node["requires"]:
                require(written[question_id]["gameEffect"]["event"] == event, f"{question_id}: wrong event")

        oral_id = chapter["oralRequired"]
        require(oral_id == f"V{number:02}-01", f"Chapter {number} has an invalid required oral question")
        required_oral.add(oral_id)
        voice_event = chapter["oralEvent"]
        require(voice_event not in encounters, f"Duplicate event {voice_event}")
        encounters.add(voice_event)
        require(oral_questions[oral_id]["gameEffect"]["event"] == voice_event, f"{oral_id}: wrong event")

        chapter_oral = [question for question in oral_questions.values() if question["chapter"] == number]
        require([question["id"] for question in chapter_oral] == [
            f"V{number:02}-{position:02}" for position in range(1, 4)
        ], f"Chapter {number} oral IDs")
        for question in records + chapter_oral:
            question_id = question["id"]
            require(question["chapter"] == number and question["scene"] == chapter["scene"],
                    f"{question_id}: chapter or scene mismatch")
            if question["track"] == "practice":
                require(question["gameEffect"]["event"] == f"archive.{question_id}",
                        f"{question_id}: wrong practice event")
            if "options" in question:
                options = question["options"]
                option_ids = {option["id"] for option in options}
                option_labels = {option["label"].casefold() for option in options}
                require(len(option_ids) == len(option_labels) == len(options), f"{question_id}: duplicate options")
                require(set(question["answer"]["correct"]) < option_ids, f"{question_id}: invalid selection key")

    story_oral = {question["id"] for question in oral_questions.values() if question["track"] == "story"}
    require(story_oral == required_oral, "The oral index and story questions disagree")
    all_questions = [*written.values(), *oral_questions.values()]
    signatures = {
        (question["prompt"], tuple(question["materials"]),
         tuple(option["label"] for option in question.get("options", [])))
        for question in all_questions
    }
    require(len(signatures) == len(all_questions), "Duplicate question content")
    counts = Counter(question["interaction"] for question in all_questions)
    print(f"{len(written)} written and {len(oral_questions)} oral questions across {len(chapters)} chapters")
    print(f"{len(encounters) - len(required_oral)} written encounters and {len(required_oral)} oral encounters")
    print(", ".join(f"{kind}={count}" for kind, count in sorted(counts.items())))


if __name__ == "__main__":
    validate_bank()
