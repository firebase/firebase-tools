###-begin-firebase-completion-###

# DECLARATIONS

function firebase_tools_completion
  set -l cur (commandline -pco)[-1]
  set -l prev (commandline -pco)[-2]
  set -l command (commandline -pco)[2]

  # No command has been entered yet
  if [ -z "$command" ]
      for i in (seq (count $COMMANDS_INDEX))
          echo $COMMANDS_INDEX[$i]\t$COMMAND_DESCRIPTIONS[$i]
      end

  # A command has been entered, user is entering options but it is not entering a parameter of an option
  else if string match -qv -- "-*" "$cur"; or not contains -- "$command:$cur" $OPTION_PARAMETERS
      for option in (string split ' ' -- $OPTIONS[(contains -i -- "$command" $COMMANDS_INDEX)])
          echo $option\t$OPTION_DESCRIPTIONS[(contains -i -- "$command:$option" $OPTIONS_INDEX)]
      end

  # An option is pending a file parameter
  else if string match -q -- "-*" "$cur"; and contains -- "$command:$cur" $ACCEPTS_FILE ]
      for file in (ls -A)
          echo $file
      end

  # We can't provide any options to the user
  else
      return 1
  end
end

complete -c firebase -a '(firebase_tools_completion)' -f
###-end-firebase-completion-###
