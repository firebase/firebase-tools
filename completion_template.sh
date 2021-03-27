# file: completion.sh

declare -A OPTIONS
# DECLARATIONS

_FirebaseToolsTabCompletion()
{
    local cur prev words cword
    _get_comp_words_by_ref -n : cur prev words cword || return

    local idx
    local word
    local command
    local last_option
    local command_options

    COMPREPLY=()
    command=${words[1]}

    for (( idx=$cword-1 ; idx>=0 ; idx-- ))
    {
        word=${words[$idx]}
        if [[ $word == -* ]]
        then
            last_option=$word
            break
        fi
    }
    test $cword -gt 1 && option="${words[cword]}"
    
    if [ -z "$command" ] || [ "$command" == "$cur" ]
    then
        # List commands
        COMPREPLY=( $( compgen -W "$COMMANDS" -- $cur ) )
    elif [ -z "$last_option" ] || [ "$last_option" == "$cur" ]
    then
        # List options
        command_options="${OPTIONS[$command]}"
        COMPREPLY=( $( compgen -W "$command_options" -- $cur ) )
    else
        # List parameters
        COMPREPLY=( $( compgen -W '$(ls -A)' -- $cur ) )
    fi

    __ltrim_colon_completions "$cur"

    return 0
}

complete -F _FirebaseToolsTabCompletion firebase
