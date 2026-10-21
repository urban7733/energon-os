import pytest

from energon_trainer.sandbox import Sandbox
from energon_trainer.suites import load_suite

SUITE = load_suite("linux_operator")


def test_split_is_stable_and_balanced():
    assert len(SUITE.tasks) >= 35
    assert 0.25 <= len(SUITE.held_out) / len(SUITE.tasks) <= 0.55
    assert {t.id for t in SUITE.train}.isdisjoint({t.id for t in SUITE.held_out})
    assert [t.id for t in load_suite("linux_operator").held_out] == [t.id for t in SUITE.held_out]


@pytest.mark.parametrize("task", SUITE.tasks, ids=lambda task: task.id)
def test_reference_solution_passes_and_doing_nothing_fails(task):
    with Sandbox() as sandbox:
        assert sandbox.run(task.setup).exit_code == 0, "setup failed"
        assert sandbox.run(task.check).exit_code != 0, "check passes without any work"
    with Sandbox() as sandbox:
        sandbox.run(task.setup)
        solved = sandbox.run(task.solution)
        assert solved.exit_code == 0, solved.output
        assert sandbox.run(task.check).exit_code == 0, "reference solution fails the check"


def test_unknown_and_unsafe_suite_names_are_rejected():
    with pytest.raises(FileNotFoundError):
        load_suite("does_not_exist")
    with pytest.raises(ValueError):
        load_suite("../etc/passwd")


def test_commands_time_out():
    with Sandbox() as sandbox:
        result = sandbox.run("sleep 5", timeout=1)
        assert result.timed_out and "timed out" in result.observation()
