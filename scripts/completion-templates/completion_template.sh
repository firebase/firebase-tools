###-begin-firebase-completion-###

# DECLARATIONS

_FirebaseToolsTabCompletion()
{
    local cur prev words cword command
    _get_comp_words_by_ref -n : cur prev words cword || return

    COMPREPLY=()
    command=${words[1]}
    
    # No command has been entered completely yet (either not entered at all, or entered incomplete)
    if [ -z "$command" ] || [ "$command" == "$cur" ]
    then
        # Completing commands
        COMPREPLY=( $( compgen -W "$COMMANDS" -- $cur ) )

    # A command has been entered, user is entering options but it is not entering a parameter of an option
    elif [[ "$prev" != -* ]] || [[ "$cur" == -* ]] || ( [[ "$prev" == -* ]] && [ -z "${PARAMETERS[$command:$prev]}" ])
    then
        # Completing options
        local command_options
        command_options="${OPTIONS[$command]}"
        COMPREPLY=( $( compgen -W "$command_options" -- $cur ) )
    # An option is pending a file parameter
    elif [ -n "${ACCEPTS_FILE[$command:$prev]}" ]
    then
        # Completing parameters
        COMPREPLY=( $( compgen -W '$(ls -A)' -- $cur ) )

    # We can't provide any options to the user
    else
        return 1
    fi

    __ltrim_colon_completions "$cur"

    return 0
}

complete -F _FirebaseToolsTabCompletion firebase
###-end-firebase-completion-###
