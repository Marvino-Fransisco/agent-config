repo=$(CDPATH='' cd -P "$(dirname "$0")/.." && pwd -P)
agent_dir=${PI_CODING_AGENT_DIR:-"$HOME/.pi/agent"}
case "$agent_dir" in
  /*) ;;
  *) agent_dir=$PWD/$agent_dir ;;
esac

extension_names='shared ui task-memory prompt tutor undo-send brainstorming'
skill_names='brainstorm domain-modeling teach'
